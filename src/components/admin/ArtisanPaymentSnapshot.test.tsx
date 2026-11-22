import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanPaymentSnapshot from './ArtisanPaymentSnapshot';
import { fetchArtisanActivity, fetchArtisanPaymentYear } from '../../services/artisanProfiles';
import { mockNativeDialog } from './dialogTestSupport';

vi.mock('../../services/artisanProfiles', () => ({ fetchArtisanPaymentYear: vi.fn(), fetchArtisanActivity: vi.fn() }));
vi.mock('../../utils/date', async original => ({
  ...await original<typeof import('../../utils/date')>(), localDate: () => '2026-11-15',
}));
const makerA = { artisanId: '1', name: 'Maker A', amount: 125.5, count: 1, latestDate: '2026-10-01' };
const makerB = { artisanId: '2', name: 'Maker B', amount: 50, count: 1, latestDate: '2026-12-31' };
const payment = { id: 'one', paid_on: '2026-10-01', amount: 125.5, method: 'UPI', reference: 'txn-1',
  description: 'Flower batch', created_at: '2026-10-01', voided_at: null, void_reason: null };
let restore: () => void;
beforeEach(() => { restore = mockNativeDialog(); vi.mocked(fetchArtisanPaymentYear).mockResolvedValue([]); });
afterEach(() => { cleanup(); restore(); vi.resetAllMocks(); });

it('retains annual and quarterly totals, counts distinct artisans and changes years', async () => {
  vi.mocked(fetchArtisanPaymentYear).mockImplementation(async year => year === '2026' ? [
    { month: '2026-03', payments: [{ ...makerA, amount: 0.1 }] },
    { month: '2026-04', payments: [{ ...makerA, amount: 0.2, count: 2 }] },
    { month: '2026-05', payments: [{ ...makerA, amount: 1, count: 1 }] },
    { month: '2026-12', payments: [{ ...makerB, amount: 10 }] },
  ] : []);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  const toggle = screen.getByRole('button', { name: 'Artisan payment snapshot' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  const annual = await screen.findByRole('article', { name: 'Year 2026 · Jan–Dec' });
  expect(annual.textContent).toContain('₹11.30');
  expect(annual.textContent).toContain('Payments5');
  expect(annual.textContent).toContain('Artisans2');
  expect(within(annual).queryByRole('button')).toBeNull();
  const q2 = screen.getByRole('article', { name: 'Q2 · Apr–Jun 2026' });
  expect(q2.textContent).toContain('₹1.20');
  expect(q2.textContent).toContain('Artisans1');
  expect(screen.queryByLabelText('Payment month')).toBeNull();
  fireEvent.change(screen.getByLabelText('Payment snapshot year'), { target: { value: '2025' } });
  expect((await screen.findByRole('article', { name: 'Year 2025 · Jan–Dec' })).textContent).toContain('₹0.00');
  fireEvent.change(screen.getByLabelText('Payment snapshot year'), { target: { value: '' } });
  expect(screen.getByText('Enter a four-digit payment year.')).toBeTruthy();
  expect(screen.queryByRole('article')).toBeNull();
});

it('shows quarter payments for all artisans in date order without voided or out-of-period entries', async () => {
  vi.mocked(fetchArtisanPaymentYear).mockResolvedValue([
    { month: '2026-10', payments: [makerA] },
    { month: '2026-11', payments: [{ ...makerA, amount: 25, latestDate: '2026-11-01' }] },
    { month: '2026-12', payments: [makerB] },
  ]);
  vi.mocked(fetchArtisanActivity).mockImplementation(async id => ({ comments: [], payments: id === '1' ? [
    payment, { ...payment, id: 'second', paid_on: '2026-11-01', amount: 25, reference: 'txn-2', description: 'Second batch' },
    { ...payment, id: 'voided', description: 'Voided batch', voided_at: '2026-10-31' },
    { ...payment, id: 'before', description: 'Previous quarter', paid_on: '2026-09-30' },
    { ...payment, id: 'after', description: 'Next year', paid_on: '2027-01-01' },
  ] : [{ ...payment, id: 'third', paid_on: '2026-12-31', amount: 50, method: 'Cash', reference: '', description: 'Final batch' }] }));
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  const trigger = await screen.findByRole('button', { name: 'View payments for Q4 · Oct–Dec 2026' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Payments · Q4 · Oct–Dec 2026' });
  expect(await within(dialog).findByText('Work / batch: Flower batch')).toBeTruthy();
  expect(within(dialog).getAllByRole('heading', { level: 3 }).map(item => item.textContent))
    .toEqual(['31/12/2026 · Maker B', '01/11/2026 · Maker A', '01/10/2026 · Maker A']);
  expect(within(dialog).getByText('Transaction reference: txn-1')).toBeTruthy();
  expect(within(dialog).getByText('Method: Cash')).toBeTruthy();
  expect(within(dialog).queryByText(/Voided batch|Previous quarter|Next year/)).toBeNull();
  expect(fetchArtisanActivity).toHaveBeenCalledTimes(2);
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('shows empty quarters and indicates when payment details no longer match the totals', async () => {
  vi.mocked(fetchArtisanPaymentYear).mockResolvedValue([{ month: '2026-10', payments: [makerA] }]);
  vi.mocked(fetchArtisanActivity).mockResolvedValue({ comments: [], payments: [] });
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View payments for Q1 · Jan–Mar 2026' }));
  expect(await screen.findByText('No recorded payments for this quarter.')).toBeTruthy();
  expect(fetchArtisanActivity).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close Payments · Q1 · Jan–Mar 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'View payments for Q4 · Oct–Dec 2026' }));
  expect(await screen.findByText(/Payment details have changed since this snapshot/)).toBeTruthy();
  expect(screen.getByText('No recorded payments for this quarter.')).toBeTruthy();
});

it('reports detail and yearly load failures and supports retry without partial totals', async () => {
  vi.mocked(fetchArtisanPaymentYear).mockRejectedValueOnce(new Error('Year unavailable'))
    .mockResolvedValue([{ month: '2026-10', payments: [makerA, makerB] }]);
  vi.mocked(fetchArtisanActivity).mockRejectedValueOnce(new Error('Payment access denied'))
    .mockImplementation(async id => ({ comments: [], payments: [{ ...payment, id }] }));
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Artisan payment snapshot' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Year unavailable');
  expect(screen.queryByRole('article')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View payments for Q4 · Oct–Dec 2026' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Payment access denied');
  expect(screen.queryByText('Work / batch: Flower batch')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry payment details' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getAllByText('Work / batch: Flower batch')).toHaveLength(2);
});
