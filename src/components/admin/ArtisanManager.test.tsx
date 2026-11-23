import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanManager from './ArtisanManager';
import { mockNativeDialog } from './dialogTestSupport';
import { emptyArtisanDetails } from '../../services/artisans';

const { list, overview, history, update, remove, invites, create, revoke, readId, removeId } = vi.hoisted(() => ({
  list: vi.fn(), overview: vi.fn(), history: vi.fn(), update: vi.fn(), remove: vi.fn(), invites: vi.fn(), create: vi.fn(), revoke: vi.fn(),
  readId: vi.fn(), removeId: vi.fn(),
}));
const { paymentStatus, requestPaymentDetails, readPaymentDetails, savePaymentDetails } = vi.hoisted(() => ({
  paymentStatus: vi.fn(),requestPaymentDetails: vi.fn(),readPaymentDetails: vi.fn(),savePaymentDetails: vi.fn(),
}));
vi.mock('../../services/artisanPaymentDetails',async importOriginal => ({
  ...await importOriginal<typeof import('../../services/artisanPaymentDetails')>(),
  paymentStatus,requestPaymentDetails,readPaymentDetails,savePaymentDetails,
}));
vi.mock('../../services/artisans', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/artisans')>(),
  fetchArtisanApplications: list, fetchArtisanOverview: overview, fetchArtisanHistory: history, updateArtisanApplication: update, deleteArtisanApplication: remove,
  fetchArtisanInvitations: invites, createArtisanInvitation: create, revokeArtisanInvitation: revoke,
  readArtisanIdentity: readId, removeArtisanIdentity: removeId,
}));
vi.mock('../../services/artisanProfiles', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/artisanProfiles')>(),
  fetchArtisanActivity: vi.fn().mockResolvedValue({ comments: [], payments: [] }),
}));
const application = { id: 'reference', details: { ...emptyArtisanDetails, fullName: 'Sample Maker', city: 'Gurugram', skills: 'Flowers' },
  contact_email: 'maker@example.test', status: 'New', admin_notes: '', version: 1, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-11-01.1' };
let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = mockNativeDialog();
  vi.clearAllMocks(); list.mockResolvedValue({ applications: [application], total: 1 });
  overview.mockResolvedValue({ total: 1, counts: { New: 1, Contacted: 0, Trial: 0, 'More information required': 0, Approved: 0, Declined: 0, Inactive: 0 } });
  history.mockResolvedValue([{ id: 1, action: 'Submitted', new_status: 'New', old_status: null, created_at: application.created_at }]);
  invites.mockResolvedValue([]); update.mockResolvedValue({ ...application, version: 2 }); remove.mockResolvedValue(undefined);
  paymentStatus.mockResolvedValue({ provided: false,verified: false,requested: false });
  requestPaymentDetails.mockResolvedValue(undefined);
  readPaymentDetails.mockResolvedValue(null);
  savePaymentDetails.mockResolvedValue(undefined);
  create.mockImplementation(async input => ({ link: `https://luviacreations.com/artisans/#invite=${input.token}`, message: 'Email accepted' }));
});
it('shows overall status counts independent of the filtered page and refreshes after review', async () => {
  overview.mockResolvedValueOnce({ total: 32, counts: { New: 3, Contacted: 4, Trial: 5, 'More information required': 6, Approved: 7, Declined: 2, Inactive: 5 } })
    .mockResolvedValue({ total: 32, counts: { New: 2, Contacted: 5, Trial: 5, 'More information required': 6, Approved: 7, Declined: 2, Inactive: 5 } });
  render(<ArtisanManager />);
  const section = screen.getByRole('region', { name: 'Artisan overview' });
  await waitFor(() => expect(within(section).getByText('Total applications').nextElementSibling?.textContent).toBe('32'));
  expect(within(section).getByText('Approved').nextElementSibling?.textContent).toBe('7');
  fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'New' } });
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('', 'New', 0, '', null));
  expect(within(section).getByText('Total applications').nextElementSibling?.textContent).toBe('32');
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Contacted' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  const refreshed = await screen.findByRole('region', { name: 'Artisan overview' });
  await waitFor(() => expect(within(refreshed).getByText('Contacted').nextElementSibling?.textContent).toBe('5'));
});

it('reports overview load errors and can retry without showing false zeroes', async () => {
  overview.mockRejectedValueOnce(new Error('Overview unavailable'));
  render(<ArtisanManager />);
  const section = screen.getByRole('region', { name: 'Artisan overview' });
  expect((await within(section).findByRole('alert')).textContent).toContain('Overview unavailable');
  expect(within(section).queryByText('Total applications')).toBeNull();
  fireEvent.click(within(section).getByRole('button', { name: 'Refresh overview' }));
  expect(await within(section).findByText('Total applications')).toBeTruthy();
});
it('requests payment details instead of starting Trial and allows manual entry and confirmation', async () => {
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button',{ name: 'Review Sample Maker' }));
  await screen.findByText('No payment details saved');
  fireEvent.change(screen.getByLabelText('Application status'),{ target: { value: 'Trial' } });
  fireEvent.submit(screen.getByRole('form',{ name: 'Review artisan' }));
  await screen.findByText(/Trial has not started/);
  expect(requestPaymentDetails).toHaveBeenCalledWith(application.id);
  expect(update).not.toHaveBeenCalled();
  const notice = screen.getByRole('dialog', { name: 'Email notification' });
  expect(notice.textContent).toContain('email has been queued');
  expect(notice.textContent).toContain('Delivery is not yet confirmed');
  fireEvent.click(within(notice).getByRole('button', { name: 'Close Email notification' }));
  fireEvent.click(screen.getByRole('button',{ name: 'Enter payment details manually' }));
  fireEvent.change(await screen.findByLabelText('Account holder name'),{ target: { value: 'Sample Maker' } });
  fireEvent.change(screen.getByLabelText('UPI ID'),{ target: { value: 'maker@bank' } });
  fireEvent.click(screen.getByRole('checkbox',{ name: /I confirmed with the artisan/ }));
  fireEvent.click(screen.getByRole('button',{ name: 'Save and confirm name' }));
  await waitFor(() => expect(savePaymentDetails).toHaveBeenCalledWith(application.id,expect.objectContaining({
    name: 'Sample Maker',method: 'UPI',upi: 'maker@bank',
  })));
});
it('fetches ID bytes only after an explicit view and requires removal confirmation', async () => {
  const withId = { ...application, identity_type: 'masked_aadhaar', identity_expires_at: '2026-11-28T00:00:00Z' };
  list.mockResolvedValue({ applications: [withId], total: 1 });
  readId.mockResolvedValue({ source: 'data:image/webp;base64,fixture', expiresAt: withId.identity_expires_at });
  removeId.mockResolvedValue(undefined);
  render(<ArtisanManager />); fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  expect(readId).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View private ID' }));
  expect(await screen.findByAltText('Private artisan identity document')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Hide ID' }));
  expect(screen.queryByAltText('Private artisan identity document')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View private ID' }));
  expect(await screen.findByAltText('Private artisan identity document')).toBeTruthy();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.queryByAltText('Private artisan identity document')).toBeNull();
  vi.restoreAllMocks();
  fireEvent.click(screen.getByRole('button', { name: 'Remove ID after review' })); expect(removeId).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm ID removal' }));
  await waitFor(() => expect(removeId).toHaveBeenCalledWith(withId));
});
it('distinguishes legacy applications from recorded dispatch acknowledgement', async () => {
  const { unmount } = render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  expect(screen.getByText(/Not recorded \(earlier application\)/)).toBeTruthy();
  unmount();
  list.mockResolvedValue({ applications: [{ ...application, dispatch_terms_version: '2026-10-29.1',
    dispatch_terms_accepted_at: '2026-10-29T00:00:00Z' }], total: 1 });
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  expect(screen.getByText(/Version 2026-10-29.1, accepted/)).toBeTruthy();
  expect(screen.queryByText(/Not recorded \(earlier application\)/)).toBeNull();
});
afterEach(() => { cleanup(); restoreDialog(); });
it('opens payments for the selected artisan from the directory', async () => {
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Payments for Sample Maker' }));
  expect(await screen.findByRole('dialog', { name: 'Payments for Sample Maker' })).toBeTruthy();
  expect(await screen.findByText('No payments recorded.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close Payments for Sample Maker' }));
  expect(screen.queryByRole('dialog', { name: 'Payments for Sample Maker' })).toBeNull();
});
it('displays original Hindi answers and preferred contact language in the directory and review', async () => {
  list.mockResolvedValue({ applications: [{ ...application, details: { ...application.details,
    fullName: 'परीक्षण कारीगर', language: 'हिन्दी, शाम को', skills: 'फूल और अमिगुरुमी', address: 'परीक्षण गली' } }], total: 1 });
  render(<ArtisanManager />);
  expect(await screen.findByText('Preferred language / contact time: हिन्दी, शाम को')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review परीक्षण कारीगर' }));
  expect(screen.getByText('हिन्दी, शाम को')).toBeTruthy();
  expect(screen.getByText('फूल और अमिगुरुमी', { selector: 'dd' })).toBeTruthy();
  expect(screen.getByText('परीक्षण गली')).toBeTruthy();
});
it('filters and searches the directory and saves a versioned review', async () => {
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Name, mobile, skill or location'), { target: { value: 'Flowers' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('Flowers', '', 0, '', null));
  fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'New' } });
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('Flowers', 'New', 0, '', null));
  fireEvent.change(screen.getByLabelText('Skill / can create'), { target: { value: 'Amigurumi' } });
  fireEvent.submit(screen.getByRole('search'));
  fireEvent.change(screen.getByLabelText('Minimum skill rating'), { target: { value: '4' } });
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('Flowers', 'New', 0, 'Amigurumi', 4));
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Contacted' } });
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Paid trial discussed' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(application, 'Contacted', 'Paid trial discussed', ''));
  expect(await screen.findByText('Application changes saved.')).toBeTruthy();
});
it('shows applicant contact email and keeps the applicant-facing request separate from internal notes', async () => {
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  expect(screen.getByText('maker@example.test', { selector: 'dd' })).toBeTruthy();
  expect(screen.getByLabelText(`Current status: ${application.status}`).textContent).toBe(application.status);
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'More information required' } });
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Internal: confirm portfolio review.' } });
  fireEvent.change(screen.getByLabelText('Message to artisan (sent by email; not an internal note)'), {
    target: { value: 'Please share a link to your crochet portfolio.' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(application, 'More information required',
    'Internal: confirm portfolio review.', 'Please share a link to your crochet portfolio.'));
  const notice = await screen.findByRole('dialog', { name: 'Email notification' });
  expect(notice.textContent).toContain('More information required email was queued');
  fireEvent.click(within(notice).getByRole('button', { name: 'Close Email notification' }));
  expect(await screen.findByText('Application changes saved.')).toBeTruthy();
});
it.each(['Approved', 'Declined'] as const)('shows a queued email notice for %s', async status => {
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: status } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('dialog', { name: 'Email notification' })).textContent)
    .toContain(`${status} email was queued`);
});
it('distinguishes an active payment request from a newly queued email', async () => {
  paymentStatus.mockResolvedValue({ provided: false, verified: false, requested: true });
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Trial' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('dialog', { name: 'Email notification' })).textContent).toContain('No new email was queued');
  expect(requestPaymentDetails).not.toHaveBeenCalled();
});
it('explains that the Trial welcome email is only queued once', async () => {
  paymentStatus.mockResolvedValue({ provided: true, verified: true, requested: false });
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Trial' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('dialog', { name: 'Email notification' })).textContent).toContain('only once per application');
});
it('does not claim an email was queued without an application email', async () => {
  list.mockResolvedValue({ applications: [{ ...application, contact_email: null }], total: 1 });
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Declined' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('dialog', { name: 'Email notification' })).textContent).toContain('no email was queued');
});
it('notifies for a revised information request but not for unchanged review notes', async () => {
  const pending = { ...application, status: 'More information required', applicant_message: 'Please share photos.' };
  list.mockResolvedValue({ applications: [pending], total: 1 });
  const view = render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Message to artisan (sent by email; not an internal note)'), { target: { value: 'Please share new photos.' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('dialog', { name: 'Email notification' })).textContent).toContain('email was queued');
  view.unmount();
  render(<ArtisanManager />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Reviewed' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect(await screen.findByText('Application changes saved.')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Email notification' })).toBeNull();
});
it('shows the submission date instead of an expiry for submitted invitations', async () => {
  const base = { recipient_name: 'Sample Maker', channel: 'email' as const, contact: 'maker@example.test',
    created_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-08T00:00:00Z', revoked_at: null, email_accepted_at: null };
  invites.mockResolvedValue([{ ...base, id: 'submitted', submitted_at: '2026-10-02T00:00:00Z' },
    { ...base, id: 'pending', contact: 'pending@example.test', expires_at: new Date(Date.now() + 86_400_000).toISOString(), submitted_at: null }]);
  render(<ArtisanManager />);
  const submitted = await screen.findByText(/^Application submitted · /);
  expect(submitted.textContent).toContain('Submitted');
  expect(submitted.textContent).not.toContain('Expire');
  expect(screen.getByText(/· Expires /)).toBeTruthy();
});
it('removes a revoked unused invitation from the admin list', async () => {
  const invitation = { id: 'invite-reference', recipient_name: 'Sample Maker', channel: 'whatsapp' as const,
    contact: '9876543210', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    revoked_at: null, submitted_at: null, email_accepted_at: null };
  let active = true;
  invites.mockImplementation(async () => active ? [invitation] : []);
  revoke.mockImplementation(async () => { active = false; });
  render(<ArtisanManager />);
  expect(await screen.findByText(/Sample Maker — 9876543210/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith(invitation.id));
  await waitFor(() => expect(screen.queryByText(/Sample Maker — 9876543210/)).toBeNull());
});
it('preserves review inputs and surfaces a concurrency conflict', async () => {
  update.mockRejectedValue(new Error('Another admin updated this application'));
  render(<ArtisanManager />); fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Keep my notes' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Another admin');
  expect(screen.getByLabelText('Internal review notes')).toHaveProperty('value', 'Keep my notes');
});
it('requires explicit confirmation before permanent deletion', async () => {
  render(<ArtisanManager />); fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete application' })); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(application));
});
it('retries the same invitation after email failure without generating a new token', async () => {
  create.mockRejectedValueOnce(new Error('Email provider unavailable'));
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Artisan name'), { target: { value: 'Maker' } });
  fireEvent.change(screen.getByLabelText('Artisan email'), { target: { value: 'maker@example.test' } });
  const form = screen.getByRole('form', { name: 'Invite artisan' });
  fireEvent.submit(form); expect((await screen.findByRole('alert')).textContent).toContain('Email provider unavailable');
  fireEvent.submit(form);
  expect(await screen.findByLabelText('Private application link')).toBeTruthy();
  expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
});
it('creates a WhatsApp deep link but does not claim that a message was sent', async () => {
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Artisan name'), { target: { value: 'Maker' } });
  fireEvent.change(screen.getByLabelText('Send using'), { target: { value: 'whatsapp' } });
  fireEvent.change(screen.getByLabelText('Artisan WhatsApp number'), { target: { value: '9876543210' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Invite artisan' }));
  const link = await screen.findByRole('link', { name: 'Open WhatsApp to send' });
  expect(link.getAttribute('href')).toContain('https://wa.me/919876543210?text=');
  expect(create.mock.calls[0][0].channel).toBe('whatsapp');
});
