import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MaterialPurchase } from '../../services/materialPurchases';
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

function purchase(overrides: Partial<MaterialPurchase>): MaterialPurchase {
  return { id: '1', purchased_on: '2026-01-01', material: 'Yarn', supplier: '', quantity: 1, unit: 'ball',
    total: 1, payment_status: 'Paid', notes: '', receipt_name: null, ...overrides };
}

it('shows a loading error rather than zero totals and supports retry', async () => {
  fetchPurchases.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce([]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  const toggle = screen.getByRole('button', { name: 'Material purchase snapshot' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect((await screen.findByRole('alert')).textContent).toContain('Access denied');
  expect(screen.queryByRole('article')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh materials' }));
  expect(await screen.findByRole('article', { name: 'Year 2026 · Jan–Dec' })).toBeTruthy();
});

it('groups purchases by year and quarter and opens date-sorted, bounded details', async () => {
  fetchPurchases.mockResolvedValue([
    purchase({ id: '1', purchased_on: '2026-03-31', material: 'March yarn', total: 0.1 }),
    purchase({ id: '2', purchased_on: '2026-04-01', material: 'April thread', total: 0.2, payment_status: 'Unpaid' }),
    purchase({ id: '3', purchased_on: '2026-12-31', material: 'December hook', total: 10 }),
    purchase({ id: '4', purchased_on: '2025-12-31', material: 'Previous year hook', total: 7 }),
    purchase({ id: '5', purchased_on: '2026-01-01', material: 'January yarn', total: 2 }),
  ]);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  const annual = await screen.findByRole('article', { name: 'Year 2026 · Jan–Dec' });
  expect(annual.textContent).toContain('₹12.30');
  expect(annual.textContent).toContain('Paid₹12.10');
  expect(annual.textContent).toContain('Unpaid₹0.20');
  expect(within(annual).queryByRole('button')).toBeNull();
  expect(screen.getByRole('article', { name: 'Q2 · Apr–Jun 2026' }).textContent).toContain('₹0.20');
  const q1 = screen.getByRole('button', { name: 'View purchases for Q1 · Jan–Mar 2026' });
  q1.focus();
  fireEvent.click(q1);
  const dialog = screen.getByRole('dialog', { name: 'Purchases · Q1 · Jan–Mar 2026' });
  expect(within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent))
    .toEqual(['31/03/2026 · March yarn', '01/01/2026 · January yarn']);
  expect(within(dialog).queryByText('April thread')).toBeNull();
  fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(q1);
  fireEvent.click(screen.getByRole('button', { name: 'View purchases for Q3 · Jul–Sep 2026' }));
  expect(screen.getByText('No purchases recorded for this quarter.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close Purchases · Q3 · Jul–Sep 2026' }));
  fireEvent.change(screen.getByLabelText('Material snapshot year'), { target: { value: '2025' } });
  expect(screen.getByRole('article', { name: 'Year 2025 · Jan–Dec' }).textContent).toContain('₹7.00');
  fireEvent.click(screen.getByRole('button', { name: 'View purchases for Q4 · Oct–Dec 2025' }));
  expect(screen.getByText('Previous year hook')).toBeTruthy();
  expect(screen.queryByText('December hook')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close Purchases · Q4 · Oct–Dec 2025' }));
  fireEvent.change(screen.getByLabelText('Material snapshot year'), { target: { value: '' } });
  expect(screen.queryByRole('article', { name: /Year/ })).toBeNull();
  expect(screen.getByText('Enter a four-digit purchase year.')).toBeTruthy();
});

it('shows all purchase details and handles receipt errors and retry', async () => {
  fetchPurchases.mockResolvedValue([
    purchase({ id: '1', purchased_on: '2026-11-01', material: 'Yarn', supplier: 'Sample shop', quantity: 2,
      unit: 'balls', total: 120.5, notes: 'Blue yarn', receipt_name: 'bill.pdf' }),
    purchase({ id: '2', purchased_on: '2026-10-01', material: 'Hook', unit: 'piece', total: 25, payment_status: 'Unpaid' }),
  ]);
  downloadReceipt.mockRejectedValueOnce(new Error('Receipt access denied')).mockResolvedValueOnce(undefined);
  render(<MaterialPurchaseSnapshot refreshKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Material purchase snapshot' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View purchases for Q4 · Oct–Dec 2026' }));
  const dialog = screen.getByRole('dialog', { name: 'Purchases · Q4 · Oct–Dec 2026' });
  for (const value of ['Sample shop', '2 balls', '₹120.50', 'Paid', 'Blue yarn', 'Unpaid', 'No receipt attached.']) {
    expect(within(dialog).getByText(value)).toBeTruthy();
  }
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download receipt: bill.pdf' }));
  expect((await within(dialog).findByRole('alert')).textContent).toContain('Receipt access denied');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download receipt: bill.pdf' }));
  expect(downloadReceipt).toHaveBeenLastCalledWith('1');
  expect(await within(dialog).findByRole('button', { name: 'Download receipt: bill.pdf' })).toBeTruthy();
  expect(within(dialog).queryByRole('alert')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Purchases · Q4 · Oct–Dec 2026' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
