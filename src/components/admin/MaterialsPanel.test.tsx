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
    category: 'Yarn', total: 120, payment_status: 'Paid', notes: '', receipt_name: 'bill.pdf' },
  { id: 'two', purchased_on: '2026-11-02', material: 'yarn', supplier: '', quantity: 1, unit: 'ball',
    category: 'Yarn', total: 50, payment_status: 'Unpaid', notes: '', receipt_name: null },
  { id: 'three', purchased_on: '2026-10-31', material: 'Hook', supplier: '', quantity: 1, unit: 'piece',
    category: 'Tool', total: 30, payment_status: 'Paid', notes: '', receipt_name: null },
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
  expect(screen.getAllByText(/Yarn: ₹170/)).toHaveLength(2);
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

it('suggests distinct material and supplier names from purchases across all months', async () => {
  fetchPurchases.mockResolvedValue([
    { ...rows[0], material: ' Yarn ', supplier: ' Shop ' },
    { ...rows[1], supplier: 'SHOP' },
    { ...rows[2], supplier: 'October Supplier' },
    { ...rows[2], id: 'blank', material: ' ', supplier: ' ' },
  ]);
  render(<MaterialsPanel />);
  await screen.findByText(/Purchase value:/);
  fireEvent.click(screen.getByRole('button', { name: 'Add purchase' }));
  const suggestions: [string, string[]][] = [
    ['Material *', ['Hook', 'Yarn']],
    ['Supplier', ['October Supplier', 'Shop']],
  ];
  for (const [label, expected] of suggestions) {
    const listId = screen.getByLabelText(label).getAttribute('list');
    expect(listId).toBeTruthy();
    const options = document.getElementById(listId!)!.querySelectorAll('option');
    expect([...options].map(option => option.value)).toEqual(expected);
  }
});

it('accepts new names when editing and updates suggestions after the purchase is saved', async () => {
  const updated = { ...rows[0], material: 'Cotton cord', supplier: 'New supplier' };
  fetchPurchases.mockResolvedValueOnce(rows).mockResolvedValueOnce([updated, ...rows.slice(1)]);
  render(<MaterialsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit purchase Yarn' }));
  fireEvent.change(screen.getByLabelText('Material *'), { target: { value: updated.material } });
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: updated.supplier } });
  fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
  await waitFor(() => expect(savePurchase).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'one', material: updated.material, supplier: updated.supplier, category: 'Yarn', total: 120 }), null, false));
  await screen.findByRole('status');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add purchase' })).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Add purchase' }));
  for (const [label, value] of [['Material *', updated.material], ['Supplier', updated.supplier]]) {
    const listId = screen.getByLabelText(label).getAttribute('list');
    const options = document.getElementById(listId!)!.querySelectorAll('option');
    expect([...options].map(option => option.value)).toContain(value);
  }
});

it('requires a category for a new non-yarn purchase and accepts an explicit choice', async () => {
  render(<MaterialsPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add purchase' }));
  fireEvent.change(screen.getByLabelText('Material *'), { target: { value: 'Hook' } });
  const category = screen.getByLabelText('Category *');
  expect(category).toHaveProperty('value', '');
  expect(category).toHaveProperty('required', true);
  fireEvent.submit(screen.getByRole('button', { name: 'Save purchase' }).closest('form')!);
  expect(screen.getByRole('alert').textContent).toContain('Choose a category');
  expect(savePurchase).not.toHaveBeenCalled();
  fireEvent.change(category, { target: { value: 'Tool' } });
  fireEvent.change(screen.getByLabelText('Quantity *'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/Unit \*/), { target: { value: 'piece' } });
  fireEvent.change(screen.getByLabelText('Total purchase cost (₹) *'), { target: { value: '30' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save purchase' }).closest('form')!);
  await waitFor(() => expect(savePurchase).toHaveBeenCalledWith(expect.objectContaining({ category: 'Tool' }), null, false));
});

it('imports purchases with existing receipt preservation and retry-safe new IDs', async () => {
  const csv = new File([''], 'purchases.csv', { type: 'text/csv' });
  Object.defineProperty(csv, 'text', { value: async () => [
    'Record ID,Purchase Date,Material,Supplier,Quantity,Unit,Total,Payment Status,Notes,Category',
    'one,2026-11-01,Yarn,Shop,2,balls,125,Paid,,Yarn',
    ',2026-11-03,Thread,Shop,1,roll,30,Unpaid,,Accessories',
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
