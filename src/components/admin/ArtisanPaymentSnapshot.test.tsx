import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanPaymentSnapshot from './ArtisanPaymentSnapshot';
import { fetchArtisanActivity, fetchArtisanPaymentSummary } from '../../services/artisanProfiles';
import { mockNativeDialog } from './dialogTestSupport';

vi.mock('../../services/artisanProfiles', () => ({ fetchArtisanPaymentSummary: vi.fn(), fetchArtisanActivity: vi.fn() }));
let restore: () => void;
beforeEach(() => { restore = mockNativeDialog(); });
afterEach(() => { cleanup(); restore(); vi.resetAllMocks(); });

it('shows per-artisan and monthly totals in paise and refreshes the selected month', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockImplementation(async month => month === '2026-10'
    ? [{ artisanId: '1', name: 'Maker A', amount: 125.50, count: 2, latestDate: '2026-10-30' },
      { artisanId: '2', name: 'Maker B', amount: 100.25, count: 1, latestDate: '2026-10-01' }]
    : []);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  expect(screen.getByRole('button', { name: 'Artisan payment snapshot' }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByLabelText('Payment month').closest('[hidden]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  fireEvent.change(screen.getByLabelText('Payment month'), { target: { value: '2026-10' } });
  expect(await screen.findByText(/Total paid: ₹225\.75/)).toBeTruthy();
  expect(screen.getByText('Maker A')).toBeTruthy();
  expect(screen.getByText('2 payments · Latest: 30/10/2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  await waitFor(() => expect(fetchArtisanPaymentSummary).toHaveBeenLastCalledWith('2026-10'));
  fireEvent.change(screen.getByLabelText('Payment month'), { target: { value: '2026-09' } });
  expect(await screen.findByText('No payments recorded for this month.')).toBeTruthy();
});

it('reports failures and retries without showing stale totals', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockRejectedValueOnce(new Error('Payment summary unavailable'))
    .mockResolvedValueOnce([]);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Payment summary unavailable');
  expect(screen.queryByText(/Total paid:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  expect(await screen.findByText('No payments recorded for this month.')).toBeTruthy();
});

it('opens selected artisan payments for the month, excluding voids and other months', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockResolvedValue([{ artisanId: '1', name: 'Maker A', amount: 175.5, count: 2, latestDate: '2026-10-30' }]);
  const payment = { id: 'one', paid_on: '2026-10-30', amount: 125.5, method: 'UPI', reference: 'txn-1',
    description: 'Flower batch', created_at: '2026-10-30', voided_at: null, void_reason: null };
  vi.mocked(fetchArtisanActivity).mockResolvedValue({ comments: [], payments: [
    payment, { ...payment, id: 'second', amount: 50, method: 'Cash', reference: '', description: 'Second batch' },
    { ...payment, id: 'voided', description: 'Voided batch', voided_at: '2026-10-31' },
    { ...payment, id: 'other', description: 'Other month', paid_on: '2026-09-30' },
  ] });
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  fireEvent.change(screen.getByLabelText('Payment month'), { target: { value: '2026-10' } });
  fireEvent.click(await screen.findByRole('button', { name: 'View payments for Maker A' }));
  const dialog = screen.getByRole('dialog', { name: 'Payments for Maker A' });
  expect(await within(dialog).findByText('Work / batch: Flower batch')).toBeTruthy();
  expect(within(dialog).getByText('Work / batch: Second batch')).toBeTruthy();
  expect(within(dialog).getByText('Transaction reference: txn-1')).toBeTruthy();
  expect(within(dialog).queryByText(/Voided batch|Other month/)).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Payments for Maker A' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows payment detail failures and lets the admin retry', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockResolvedValue([{ artisanId: '1', name: 'Maker A', amount: 125.5, count: 1, latestDate: '2026-10-30' }]);
  vi.mocked(fetchArtisanActivity).mockRejectedValueOnce(new Error('Payment access denied'))
    .mockResolvedValueOnce({ comments: [], payments: [] });
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View payments for Maker A' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Payment access denied');
  fireEvent.click(screen.getByRole('button', { name: 'Retry payment details' }));
  expect(await screen.findByText(/No recorded payments remain/)).toBeTruthy();
});
