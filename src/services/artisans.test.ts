import { beforeEach, expect, it, vi } from 'vitest';
import { checkArtisanInvitation, createArtisanInvitation, emptyArtisanDetails, fetchArtisanApplications, prepareArtisanIdentity, readArtisanIdentity, removeArtisanIdentity, submitArtisanApplication, updateArtisanApplication, validateArtisanDetails } from './artisans';

const { session, anonymous, rpc, invoke, captcha, convert } = vi.hoisted(() => ({
  session: vi.fn(), anonymous: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), captcha: vi.fn(), convert: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({
  auth: { getSession: session, signInAnonymously: anonymous }, rpc, functions: { invoke },
}) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: captcha }));
vi.mock('../utils/imageUploadConversion', () => ({ convertImageForUpload: convert }));
const details = { ...emptyArtisanDetails, fullName: 'Sample Maker', mobile: '9876543210', city: 'Gurugram',
  state: 'Haryana', pin: '122001', language: 'Hindi, evenings', skills: 'Crochet flowers', availability: '5 hours/week', adult: true, consent: true };
beforeEach(() => {
  vi.clearAllMocks(); session.mockResolvedValue({ data: { session: {} } });
  anonymous.mockResolvedValue({ error: null }); captcha.mockResolvedValue('captcha');
  rpc.mockResolvedValue({ data: 'receipt' });
});
it('sends only explicit application details, consent version and invitation token', async () => {
  expect(await submitArtisanApplication(details, 'receipt', 'private-token', true)).toBe('receipt');
  expect(rpc).toHaveBeenCalledWith('submit_artisan_application', {
    request_id: 'receipt', application_details: details, privacy_version: '2026-10-29.2', invitation_token: 'private-token',
    dispatch_terms_version: '2026-10-29.1', identity_document: null,
  });
  expect(anonymous).not.toHaveBeenCalled();
});
it('creates a CAPTCHA-protected guest session only if needed', async () => {
  session.mockResolvedValue({ data: { session: null } });
  await submitArtisanApplication(details, 'receipt', 'token', true);
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
  await expect(submitArtisanApplication(details, 'receipt', 'token', true)).rejects.toThrow('Session unavailable');
  rpc.mockResolvedValueOnce({ error: { message: 'Invitation expired' } });
  await expect(submitArtisanApplication(details, 'receipt', 'token', true)).rejects.toThrow('Invitation expired');
  rpc.mockResolvedValueOnce({ data: 'different' });
  await expect(submitArtisanApplication(details, 'receipt', 'token', true)).rejects.toThrow('receipt could not be confirmed');
});
it('requires explicit dispatch acknowledgement before contacting the backend', async () => {
  await expect(submitArtisanApplication(details, 'receipt', 'token')).rejects.toThrow('courier charge terms');
  expect(rpc).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
});
it('prepares an ID image without a watermark and submits it atomically with the application', async () => {
  const file = new File(['original'], 'identity.jpg', { type: 'image/jpeg' });
  convert.mockResolvedValue(new File(['prepared'], 'identity.webp', { type: 'image/webp' }));
  const identity = await prepareArtisanIdentity(file, 'masked_aadhaar');
  expect(convert).toHaveBeenCalledWith(file, { watermark: false });
  expect(identity).toEqual({ documentType: 'masked_aadhaar', contentType: 'image/webp', data: btoa('prepared'), consent: true });
  await submitArtisanApplication(details, 'receipt', 'token', true, identity);
  expect(rpc).toHaveBeenCalledWith('submit_artisan_application', expect.objectContaining({ identity_document: identity }));
});
it('rejects unsupported, empty and oversized files without attempting conversion', async () => {
  for (const file of [
    new File(['pdf'], 'id.pdf', { type: 'application/pdf' }),
    new File([], 'empty.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }),
  ]) await expect(prepareArtisanIdentity(file, 'masked_aadhaar')).rejects.toThrow('up to 5 MB');
  expect(convert).not.toHaveBeenCalled();
  convert.mockResolvedValue(new File([new Uint8Array(1024 * 1024 + 1)], 'large.webp', { type: 'image/webp' }));
  await expect(prepareArtisanIdentity(new File(['jpg'], 'id.jpg', { type: 'image/jpeg' }), 'alternative_id')).rejects.toThrow('exceeds 1 MB');
});
it('validates ID preview responses and surfaces MFA or removal failures', async () => {
  rpc.mockResolvedValueOnce({ data: { contentType: 'image/webp', data: 'cHJlcGFyZWQ=', expiresAt: '2026-11-28' } });
  expect((await readArtisanIdentity('id')).source).toBe('data:image/webp;base64,cHJlcGFyZWQ=');
  rpc.mockResolvedValueOnce({ data: { contentType: 'text/html', data: 'markup', expiresAt: '' } });
  await expect(readArtisanIdentity('id')).rejects.toThrow('Invalid identity');
  rpc.mockResolvedValueOnce({ error: { message: 'Verified admin access required' } });
  await expect(readArtisanIdentity('id')).rejects.toThrow('Verified admin');
  rpc.mockResolvedValueOnce({ error: { message: 'Application changed' } });
  await expect(removeArtisanIdentity({ id: 'id', details, status: 'New', admin_notes: '', version: 1, created_at: '', updated_at: '', consent_version: '' })).rejects.toThrow('Application changed');
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
