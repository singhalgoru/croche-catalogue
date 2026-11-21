import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MaterialPurchaseSnapshot from './MaterialPurchaseSnapshot';
import { mockNativeDialog } from './dialogTestSupport';

const { fetchPurchases, downloadReceipt } = vi.hoisted(() => ({ fetchPurchases: vi.fn(), downloadReceipt: vi.fn() }));
vi.mock('../../services/materialPurchases', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/materialPurchases')>(), fetchMaterialPurchases: fetchPurchases,
  downloadMaterialReceipt: downloadReceipt,
}));
vi.mock('../../utils/date', async importOriginal => ({
  ...await importOriginal<typeof import('../../utils/date')>(), localDate: () => '2026-11-15',
}));
let restore: () => void;
beforeEach(() => { restore = mockNativeDialog(); });
afterEach(() => { cleanup(); restore(); vi.resetAllMocks(); });

it('starts collapsed and shows the selected purchase month with separate payment totals', async () => {
  fetchPurchases.mockResolvedValue([
    { id: '1', purchased_on: '2026-11-01', material: 'Yarn', total: 120, payment_status: 'Paid' },
    { id: '2', purchased_on: '2026-11-02', material: 'yarn', total: 50, payment_status: 'Unpaid' },
    { id: '3', purchased_on: '2026-10-01', material: 'Hook', total: 25, payment_status: 'Paid' },
  ]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  const toggle = screen.getByRole('button', { name: 'Material purchase snapshot' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect((await screen.findByText(/Purchase value:/)).textContent).toContain('Paid: ₹120.00 · Unpaid: ₹50.00');
  expect(screen.getByText('Yarn: ₹170.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Material purchase month'), { target: { value: '2026-10' } });
  expect(screen.getByText('Hook: ₹25.00')).toBeTruthy();
});

it('shows a loading error rather than zero totals and supports retry', async () => {
  fetchPurchases.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce([]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Access denied');
  expect(screen.queryByText(/Purchase value:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh materials' }));
  expect(await screen.findByText(/Purchase value:/)).toBeTruthy();
});

it('groups paid and unpaid purchases by calendar year and quarter', async () => {
  fetchPurchases.mockResolvedValue([
    { id: '1', purchased_on: '2026-03-31', material: 'Yarn', total: 0.1, payment_status: 'Paid' },
    { id: '2', purchased_on: '2026-04-01', material: 'Thread', total: 0.2, payment_status: 'Unpaid' },
    { id: '3', purchased_on: '2026-12-31', material: 'Hook', total: 10, payment_status: 'Paid' },
    { id: '4', purchased_on: '2025-12-31', material: 'Hook', total: 7, payment_status: 'Paid' },
  ]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  const annual = await screen.findByRole('article', { name: 'Year 2026 · Jan–Dec' });
  expect(annual.textContent).toContain('₹10.30');
  expect(annual.textContent).toContain('Paid₹10.10');
  expect(annual.textContent).toContain('Unpaid₹0.20');
  expect(screen.getByRole('article', { name: 'Q1 · Jan–Mar 2026' }).textContent).toContain('₹0.10');
  expect(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2026' }).textContent).toContain('₹0.20');
  expect(screen.getByRole('article', { name: 'Q3 · Jul–Sep 2026' }).textContent).toContain('₹0.00');
  fireEvent.change(screen.getByLabelText('Material snapshot year'), { target: { value: '2025' } });
  expect(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' }).textContent).toContain('₹7.00');
  fireEvent.change(screen.getByLabelText('Material snapshot year'), { target: { value: '' } });
  expect(screen.queryByRole('article', { name: /Year/ })).toBeNull();
  expect(screen.getByText('Enter a four-digit purchase year.')).toBeTruthy();
});

it('opens the selected monthly purchase and handles receipt errors and retry', async () => {
  fetchPurchases.mockResolvedValue([
    { id: '1', purchased_on: '2026-11-01', material: 'Yarn', supplier: 'Sample shop', quantity: 2, unit: 'balls',
      total: 120.5, payment_status: 'Paid', notes: 'Blue yarn', receipt_name: 'bill.pdf' },
    { id: '2', purchased_on: '2026-11-02', material: 'Yarn', supplier: '', quantity: 1, unit: 'ball',
      total: 50, payment_status: 'Unpaid', notes: '', receipt_name: null },
    { id: '3', purchased_on: '2026-10-01', material: 'Hook', supplier: '', quantity: 1, unit: 'piece',
      total: 25, payment_status: 'Paid', notes: '', receipt_name: null },
  ]);
  downloadReceipt.mockRejectedValueOnce(new Error('Receipt access denied')).mockResolvedValueOnce(undefined);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View purchase Yarn on 01/11/2026' }));
  const dialog = screen.getByRole('dialog', { name: 'Purchase details: Yarn' });
  expect(within(dialog).getByText('Sample shop')).toBeTruthy();
  expect(within(dialog).getByText('2 balls')).toBeTruthy();
  expect(within(dialog).getByText('₹120.50')).toBeTruthy();
  expect(within(dialog).getByText('Paid')).toBeTruthy();
  expect(within(dialog).getByText('Blue yarn')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download receipt: bill.pdf' }));
  expect((await within(dialog).findByRole('alert')).textContent).toContain('Receipt access denied');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download receipt: bill.pdf' }));
  expect(downloadReceipt).toHaveBeenLastCalledWith('1');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Purchase details: Yarn' }));
  fireEvent.click(screen.getByRole('button', { name: 'View purchase Yarn on 02/11/2026' }));
  const second = screen.getByRole('dialog', { name: 'Purchase details: Yarn' });
  expect(within(second).getByText('Unpaid')).toBeTruthy();
  expect(within(second).getByText('No receipt attached.')).toBeTruthy();
  fireEvent.click(within(second).getByRole('button', { name: 'Close Purchase details: Yarn' }));
  expect(screen.queryByRole('button', { name: /View purchase Hook/ })).toBeNull();
  fireEvent.change(screen.getByLabelText('Material purchase month'), { target: { value: '2026-10' } });
  expect(screen.getByRole('button', { name: 'View purchase Hook on 01/10/2026' })).toBeTruthy();
});
