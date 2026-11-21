import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanPaymentSnapshot from './ArtisanPaymentSnapshot';
import { fetchArtisanActivity, fetchArtisanPaymentSummary, fetchArtisanPaymentYear } from '../../services/artisanProfiles';
import { mockNativeDialog } from './dialogTestSupport';

vi.mock('../../services/artisanProfiles', () => ({ fetchArtisanPaymentSummary: vi.fn(), fetchArtisanPaymentYear: vi.fn(), fetchArtisanActivity: vi.fn() }));
let restore: () => void;
beforeEach(() => { restore = mockNativeDialog(); vi.mocked(fetchArtisanPaymentYear).mockResolvedValue([]); });
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

it('shows annual and quarterly payments, counts distinct artisans and retains monthly details', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockResolvedValue([]);
  const maker = { artisanId: '1', name: 'Maker', amount: 0.1, count: 1, latestDate: '2026-03-31' };
  vi.mocked(fetchArtisanPaymentYear).mockImplementation(async year => year === '2026' ? [
    { month: '2026-03', payments: [maker] },
    { month: '2026-04', payments: [{ ...maker, amount: 0.2, count: 2, latestDate: '2026-04-01' }] },
    { month: '2026-12', payments: [{ ...maker, artisanId: '2', amount: 10, latestDate: '2026-12-31' }] },
  ] : []);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  fireEvent.change(screen.getByLabelText('Payment snapshot year'), { target: { value: '2026' } });
  const annual = await screen.findByRole('article', { name: 'Year 2026 · Jan–Dec' });
  expect(annual.textContent).toContain('₹10.30');
  expect(annual.textContent).toContain('Payments4');
  expect(annual.textContent).toContain('Artisans2');
  expect(screen.getByRole('article', { name: 'Q1 · Jan–Mar 2026' }).textContent).toContain('₹0.10');
  expect(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2026' }).textContent).toContain('₹0.20');
  expect(screen.getByRole('article', { name: 'Q3 · Jul–Sep 2026' }).textContent).toContain('₹0.00');
  expect(screen.getByLabelText('Payment month')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Payment snapshot year'), { target: { value: '2025' } });
  expect((await screen.findByRole('article', { name: 'Year 2025 · Jan–Dec' })).textContent).toContain('₹0.00');
});

it('reports a yearly load failure without displaying partial totals and retries', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockResolvedValue([]);
  vi.mocked(fetchArtisanPaymentYear).mockRejectedValueOnce(new Error('Year unavailable')).mockResolvedValue([]);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Year unavailable');
  expect(screen.queryByRole('article', { name: /Year/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  expect(await screen.findByRole('article', { name: /Year/ })).toBeTruthy();
});
