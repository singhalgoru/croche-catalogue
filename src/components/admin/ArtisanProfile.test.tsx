import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanProfile from './ArtisanProfile';
import { emptyArtisanDetails } from '../../services/artisans';
import { addArtisanComment, fetchArtisanActivity, readArtisanPhoto, recordArtisanPayment, saveArtisanSkills, voidArtisanPayment } from '../../services/artisanProfiles';

vi.mock('../../services/artisanProfiles', async original => ({
  ...await original<typeof import('../../services/artisanProfiles')>(),
  addArtisanComment: vi.fn(), fetchArtisanActivity: vi.fn(), recordArtisanPayment: vi.fn(),
  saveArtisanSkills: vi.fn(), voidArtisanPayment: vi.fn(), readArtisanPhoto: vi.fn(),
}));
const application = { id: 'artisan', details: { ...emptyArtisanDetails, fullName: 'Sample Maker', skills: 'Flowers' },
  status: 'Approved' as const, admin_notes: '', version: 1, created_at: '', updated_at: '', consent_version: '', has_profile_photo: true };
const payment = { id: 'payment', paid_on: '2026-10-30', amount: 125.5, method: 'UPI', reference: 'synthetic-ref',
  description: 'Trial', created_at: '2026-10-30', voided_at: null, void_reason: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchArtisanActivity).mockResolvedValue({ comments: [], payments: [] });
  vi.mocked(saveArtisanSkills).mockResolvedValue({ ...application, skill_rating: 4, version: 2 });
  vi.mocked(recordArtisanPayment).mockResolvedValue(undefined);
  vi.mocked(addArtisanComment).mockResolvedValue(undefined);
  vi.mocked(voidArtisanPayment).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('prefills skills, leaves rating unassigned and fetches photos only on demand', async () => {
  const updated = vi.fn();
  vi.mocked(readArtisanPhoto).mockResolvedValue('data:image/webp;base64,cGhvdG8=');
  render(<ArtisanProfile application={application} onUpdated={updated} onActivityChanged={vi.fn()} />);
  expect(screen.getByLabelText('Can create / assessed skills')).toHaveProperty('value', 'Flowers');
  expect(screen.getByLabelText('Skill rating')).toHaveProperty('value', '');
  expect(readArtisanPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View profile photo' }));
  expect(await screen.findByAltText('Private profile of Sample Maker')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Skill rating'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Can create / assessed skills'), { target: { value: 'Flowers and toys' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Artisan skills' }));
  await waitFor(() => expect(saveArtisanSkills).toHaveBeenCalledWith(application, 4, 'Flowers and toys'));
  await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ version: 2 })));
});
it('preserves comment and request ID on a network failure then reloads activity', async () => {
  vi.mocked(addArtisanComment).mockRejectedValueOnce(new Error('Offline'));
  render(<ArtisanProfile application={application} onUpdated={vi.fn()} onActivityChanged={vi.fn()} />);
  await screen.findByText('No comments yet.');
  fireEvent.change(screen.getByLabelText('New internal comment'), { target: { value: 'Good stitches' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Add artisan comment' }));
  await screen.findByText('Offline');
  expect(screen.getByLabelText('New internal comment')).toHaveProperty('value', 'Good stitches');
  fireEvent.submit(screen.getByRole('form', { name: 'Add artisan comment' }));
  await screen.findByText('Comment added.');
  expect(vi.mocked(addArtisanComment).mock.calls[0]).toEqual(vi.mocked(addArtisanComment).mock.calls[1]);
  expect(screen.getByLabelText('New internal comment')).toHaveProperty('value', '');
});
it('records payment with a retry-safe request and requires explicit reasoned voiding', async () => {
  vi.mocked(recordArtisanPayment).mockRejectedValueOnce(new Error('Interrupted'));
  vi.mocked(fetchArtisanActivity).mockResolvedValue({ comments: [], payments: [payment, { ...payment, id: 'voided', amount: 50, voided_at: '2026-10-30', void_reason: 'Wrong batch' }] });
  render(<ArtisanProfile application={application} onUpdated={vi.fn()} onActivityChanged={vi.fn()} />);
  expect((await screen.findByText(/Total paid/)).textContent).toContain('125.50');
  fireEvent.change(screen.getByLabelText('Amount paid (INR)'), { target: { value: '125.50' } });
  fireEvent.change(screen.getByLabelText('Transaction reference (optional for cash)'), { target: { value: 'synthetic-ref' } });
  fireEvent.change(screen.getByLabelText('Work / batch description'), { target: { value: 'Trial' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Record artisan payment' }));
  await screen.findByText('Interrupted');
  fireEvent.submit(screen.getByRole('form', { name: 'Record artisan payment' }));
  await screen.findByText('Payment recorded. No money was sent by this site.');
  expect(vi.mocked(recordArtisanPayment).mock.calls[0]).toEqual(vi.mocked(recordArtisanPayment).mock.calls[1]);
  fireEvent.click(screen.getByRole('button', { name: /Void payment 2026-10-30/ }));
  expect(voidArtisanPayment).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Reason for voiding'), { target: { value: 'Wrong batch' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Void artisan payment' }));
  await waitFor(() => expect(voidArtisanPayment).toHaveBeenCalledWith('payment', 'Wrong batch'));
});
it('surfaces activity errors and offers retry without an empty success state', async () => {
  vi.mocked(fetchArtisanActivity).mockRejectedValueOnce(new Error('Unable to load ledger'));
  render(<ArtisanProfile application={application} onUpdated={vi.fn()} onActivityChanged={vi.fn()} />);
  await screen.findByText('Unable to load ledger');
  expect(screen.queryByText('No payments recorded.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Record payment' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry comments and payments' }));
  expect(await screen.findByText('No payments recorded.')).toBeTruthy();
});
