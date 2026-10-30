import { beforeEach, expect, it, vi } from 'vitest';
import { addArtisanComment, fetchArtisanActivity, readArtisanPhoto, recordArtisanPayment, saveArtisanSkills, voidArtisanPayment } from './artisanProfiles';
import { emptyArtisanDetails } from './artisans';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc }) }));
const application = { id: 'artisan', details: emptyArtisanDetails, status: 'Approved' as const, admin_notes: '',
  version: 3, created_at: '', updated_at: '', consent_version: '' };
const payment = { date: '2026-10-30', amount: '125.50', method: 'UPI' as const, reference: 'transaction', description: 'Trial batch' };
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: 'request' }); });
it('saves skills with concurrency protection and validates ratings', async () => {
  rpc.mockResolvedValue({ data: { ...application, skill_rating: 4, capabilities: 'Toys', version: 4 } });
  expect((await saveArtisanSkills(application, 4, 'Toys')).version).toBe(4);
  expect(rpc).toHaveBeenCalledWith('save_artisan_skills', { application_id: 'artisan', expected_version: 3, rating: 4, can_create: 'Toys' });
  for (const rating of [0, 6, 1.5, NaN]) await expect(saveArtisanSkills(application, rating, 'Toys')).rejects.toThrow('1 to 5');
});
it('records INR payments with a stable request ID and no payout credentials', async () => {
  await recordArtisanPayment('artisan', 'request', payment);
  expect(rpc).toHaveBeenCalledWith('record_artisan_payment', { application_id: 'artisan', request_id: 'request',
    payment_date: '2026-10-30', payment_amount: 125.5, payment_method: 'UPI', payment_reference: 'transaction', payment_description: 'Trial batch' });
});
it.each([{ amount: '-1' }, { amount: '0' }, { amount: '1.001' }, { amount: 'NaN' }, { amount: '10000001' },
  { reference: '' }, { description: ' ' }, { date: '' }])('rejects invalid payment input: %j', async patch => {
  await expect(recordArtisanPayment('artisan', 'request', { ...payment, ...patch })).rejects.toThrow('Check payment');
  expect(rpc).not.toHaveBeenCalled();
});
it('allows cash without a transaction reference and requires a reason to void', async () => {
  await recordArtisanPayment('artisan', 'request', { ...payment, method: 'Cash', reference: '' });
  await expect(voidArtisanPayment('request', ' ')).rejects.toThrow('correction reason');
  await voidArtisanPayment('request', 'Wrong batch');
  expect(rpc).toHaveBeenLastCalledWith('void_artisan_payment', { payment_id: 'request', reason: 'Wrong batch' });
});
it('validates activity, photo and save receipts instead of accepting malformed success', async () => {
  rpc.mockResolvedValueOnce({ data: { comments: [], payments: [] } });
  expect(await fetchArtisanActivity('artisan')).toEqual({ comments: [], payments: [] });
  rpc.mockResolvedValueOnce({ data: { comments: [], payments: [{}] } });
  await expect(fetchArtisanActivity('artisan')).rejects.toThrow('Invalid artisan activity');
  rpc.mockResolvedValueOnce({ data: { contentType: 'image/webp', data: 'cGhvdG8=' } });
  expect(await readArtisanPhoto('artisan')).toBe('data:image/webp;base64,cGhvdG8=');
  rpc.mockResolvedValueOnce({ data: { contentType: 'text/html', data: 'markup' } });
  await expect(readArtisanPhoto('artisan')).rejects.toThrow('Invalid profile photo');
  rpc.mockResolvedValueOnce({ data: 'different' });
  await expect(addArtisanComment('artisan', 'request', 'Work feedback')).rejects.toThrow('could not be confirmed');
  rpc.mockResolvedValueOnce({ error: { message: 'Verified admin access required' } });
  await expect(fetchArtisanActivity('artisan')).rejects.toThrow('Verified admin');
});
