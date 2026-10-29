import { beforeEach, expect, it, vi } from 'vitest';
import { checkArtisanInvitation, createArtisanInvitation, emptyArtisanDetails, fetchArtisanApplications, submitArtisanApplication, updateArtisanApplication, validateArtisanDetails } from './artisans';

const { session, anonymous, rpc, invoke, captcha } = vi.hoisted(() => ({
  session: vi.fn(), anonymous: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), captcha: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({
  auth: { getSession: session, signInAnonymously: anonymous }, rpc, functions: { invoke },
}) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: captcha }));
const details = { ...emptyArtisanDetails, fullName: 'Sample Maker', mobile: '9876543210', city: 'Gurugram',
  state: 'Haryana', pin: '122001', language: 'Hindi, evenings', skills: 'Crochet flowers', availability: '5 hours/week', adult: true, consent: true };
beforeEach(() => {
  vi.clearAllMocks(); session.mockResolvedValue({ data: { session: {} } });
  anonymous.mockResolvedValue({ error: null }); captcha.mockResolvedValue('captcha');
  rpc.mockResolvedValue({ data: 'receipt' });
});
it('sends only explicit application details, consent version and invitation token', async () => {
  expect(await submitArtisanApplication(details, 'receipt', 'private-token')).toBe('receipt');
  expect(rpc).toHaveBeenCalledWith('submit_artisan_application', {
    request_id: 'receipt', application_details: details, privacy_version: '2026-10-29', invitation_token: 'private-token',
  });
  expect(anonymous).not.toHaveBeenCalled();
});
it('creates a CAPTCHA-protected guest session only if needed', async () => {
  session.mockResolvedValue({ data: { session: null } });
  await submitArtisanApplication(details, 'receipt', 'token');
  expect(anonymous).toHaveBeenCalledWith({ options: { captchaToken: 'captcha' } });
});
it.each([
  [{ fullName: ' ' }, 'full name'], [{ mobile: '123' }, 'mobile number'], [{ pin: '000000' }, 'PIN code'],
  [{ adult: false }, '18 or older'], [{ consent: false }, 'privacy notice'],
  [{ portfolioUrl: 'javascript:alert(1)' }, 'https://'], [{ portfolioUrl: 'https://user:pass@example.test' }, 'credentials'],
  [{ skills: 'x'.repeat(1001) }, '1'],
])('rejects invalid applicant data before submission: %j', (change, message) => {
  expect(() => validateArtisanDetails({ ...details, ...change })).toThrow(message);
  expect(rpc).not.toHaveBeenCalled();
});
it('allows beginners without portfolios, tools or trial opt-in', () => {
  expect(() => validateArtisanDetails(details)).not.toThrow();
});
it('does not report success for session errors, database errors or invalid receipts', async () => {
  session.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Session unavailable' } });
  await expect(submitArtisanApplication(details, 'receipt', 'token')).rejects.toThrow('Session unavailable');
  rpc.mockResolvedValueOnce({ error: { message: 'Invitation expired' } });
  await expect(submitArtisanApplication(details, 'receipt', 'token')).rejects.toThrow('Invitation expired');
  rpc.mockResolvedValueOnce({ data: 'different' });
  await expect(submitArtisanApplication(details, 'receipt', 'token')).rejects.toThrow('receipt could not be confirmed');
});
it('validates invitation status and admin directory response shapes', async () => {
  rpc.mockResolvedValueOnce({ data: 'available' });
  expect(await checkArtisanInvitation('token')).toBe('available');
  rpc.mockResolvedValueOnce({ data: 'unknown' });
  await expect(checkArtisanInvitation('token')).rejects.toThrow('Invalid invitation');
  rpc.mockResolvedValueOnce({ data: { applications: [], total: 0 } });
  expect(await fetchArtisanApplications('flowers', 'New', 0)).toEqual({ applications: [], total: 0 });
  expect(rpc).toHaveBeenLastCalledWith('list_artisan_applications', { search_text: 'flowers', status_filter: 'New', page_number: 0 });
  rpc.mockResolvedValueOnce({ data: { applications: [{}], total: 1 } });
  await expect(fetchArtisanApplications('', '', 0)).rejects.toThrow('Invalid artisan directory');
});
it('passes the expected version to prevent overwriting another admin review', async () => {
  const application = { id: 'id', details, status: 'New' as const, admin_notes: '', version: 3, created_at: '', updated_at: '', consent_version: '2026-10-29' };
  rpc.mockResolvedValue({ data: { ...application, status: 'Contacted', version: 4 } });
  expect((await updateArtisanApplication(application, 'Contacted', 'Call arranged')).version).toBe(4);
  expect(rpc).toHaveBeenCalledWith('update_artisan_application', {
    application_id: 'id', expected_version: 3, next_status: 'Contacted', review_notes: 'Call arranged',
  });
});
it('surfaces invitation email errors and validates the returned private link', async () => {
  const input = { id: 'id', token: 'token', name: 'Maker', channel: 'email' as const, contact: 'maker@example.test' };
  invoke.mockResolvedValueOnce({ error: { message: 'Failure', context: new Response(JSON.stringify({ error: 'Email provider unavailable' })) } });
  await expect(createArtisanInvitation(input)).rejects.toThrow('Email provider unavailable');
  invoke.mockResolvedValueOnce({ data: { link: 'https://other.test/', message: 'Sent' } });
  await expect(createArtisanInvitation(input)).rejects.toThrow('Invalid invitation receipt');
});
