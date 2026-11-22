import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MaterialsPanel from './MaterialsPanel';

const { fetchPurchases, savePurchase, deletePurchase, downloadReceipt } = vi.hoisted(() => ({
  fetchPurchases: vi.fn(), savePurchase: vi.fn(), deletePurchase: vi.fn(), downloadReceipt: vi.fn(),
}));
vi.mock('../../services/materialPurchases', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/materialPurchases')>(),
  fetchMaterialPurchases: fetchPurchases, saveMaterialPurchase: savePurchase,
  deleteMaterialPurchase: deletePurchase, downloadMaterialReceipt: downloadReceipt,
}));
vi.mock('../../utils/date', async original => ({
  ...await original<typeof import('../../utils/date')>(), localDate: () => '2026-11-15',
}));
const rows = [
  { id: 'one', purchased_on: '2026-11-01', material: 'Yarn', supplier: 'Shop', quantity: 2, unit: 'balls',
    total: 120, payment_status: 'Paid', notes: '', receipt_name: 'bill.pdf' },
  { id: 'two', purchased_on: '2026-11-02', material: 'yarn', supplier: '', quantity: 1, unit: 'ball',
    total: 50, payment_status: 'Unpaid', notes: '', receipt_name: null },
  { id: 'three', purchased_on: '2026-10-31', material: 'Hook', supplier: '', quantity: 1, unit: 'piece',
    total: 30, payment_status: 'Paid', notes: '', receipt_name: null },
];
beforeEach(() => {
  vi.clearAllMocks(); fetchPurchases.mockResolvedValue(rows); savePurchase.mockResolvedValue(undefined);
  deletePurchase.mockResolvedValue(undefined); downloadReceipt.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('summarises purchase-month totals by status and material, separately from sales', async () => {
  render(<MaterialsPanel />);
  expect((await screen.findByText(/Purchase value:/)).textContent).toContain('170');
  expect(screen.getByText(/Purchase value:/).textContent).toContain('Paid: ₹120');
  expect(screen.getByText(/Purchase value:/).textContent).toContain('Unpaid: ₹50');
  expect(screen.getByText(/Yarn: ₹170/)).toBeTruthy();
  expect(screen.getByText(/do not affect Sales profit/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Purchase month'), { target: { value: '2026-10' } });
  expect(screen.getByText(/Purchase value:/).textContent).toContain('30');
  expect(screen.queryByText(/Yarn: ₹170/)).toBeNull();
});
it('edits a purchase and surfaces a failed receipt download', async () => {
  downloadReceipt.mockRejectedValueOnce(new Error('Receipt access denied'));
  render(<MaterialsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download receipt: bill.pdf' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Receipt access denied');
  fireEvent.click(screen.getByRole('button', { name: 'Edit purchase Yarn' }));
  fireEvent.change(screen.getByLabelText(/Payment status/), { target: { value: 'Unpaid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
  await waitFor(() => expect(savePurchase).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'one', payment_status: 'Unpaid', total: 120 }), null, false));
  expect((await screen.findByRole('status')).textContent).toContain('Purchase saved.');
});
it('does not present an empty summary after a load failure and can retry', async () => {
  fetchPurchases.mockRejectedValueOnce(new Error('Access denied'));
  render(<MaterialsPanel />);
  expect((await screen.findByRole('alert')).textContent).toContain('Access denied');
  expect(screen.queryByText(/Purchase value:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh purchases' }));
  expect(await screen.findByText(/Purchase value:/)).toBeTruthy();
});

it('imports purchases with existing receipt preservation and retry-safe new IDs', async () => {
  const csv = new File([''], 'purchases.csv', { type: 'text/csv' });
  Object.defineProperty(csv, 'text', { value: async () => [
    'Record ID,Purchase Date,Material,Supplier,Quantity,Unit,Total,Payment Status,Notes',
    'one,2026-11-01,Yarn,Shop,2,balls,125,Paid,',
    ',2026-11-03,Thread,Shop,1,roll,30,Unpaid,',
  ].join('\n') });
  savePurchase.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Offline'));
  render(<MaterialsPanel />);
  await screen.findByText(/Purchase value:/);
  const input = screen.getByLabelText('Upload purchases CSV');
  fireEvent.change(input, { target: { files: [csv] } });
  expect((await screen.findByRole('alert')).textContent).toContain('1 entries confirmed saved');
  const newId = savePurchase.mock.calls[1][0].id;
  expect(savePurchase.mock.calls[0]).toEqual([expect.objectContaining({ id: 'one', total: 125 }), null, false]);
  fireEvent.change(input, { target: { files: [csv] } });
  expect((await screen.findByRole('status')).textContent).toContain('Imported 2 purchases');
  expect(savePurchase.mock.calls[3][0].id).toBe(newId);
});
