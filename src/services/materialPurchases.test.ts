import { beforeEach, expect, it, vi } from 'vitest';
import { deleteMaterialPurchase, fetchMaterialPurchases, saveMaterialPurchase, validateMaterialReceipt,
  type MaterialPurchaseInput } from './materialPurchases';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ from, rpc }) }));
const input: MaterialPurchaseInput = { id: 'id', purchased_on: '2026-11-01', material: 'Yarn',
  supplier: 'Shop', quantity: 2, unit: 'balls', total: 120.5, payment_status: 'Paid', notes: '' };
beforeEach(() => { from.mockReset(); rpc.mockReset(); });

it.each([{ material: ' ' }, { purchased_on: '2026-02-30' }, { quantity: 0 }, { quantity: 0.0001 },
  { total: -1 }, { total: 1.001 }, { unit: '' }, { notes: 'x'.repeat(1001) }])('rejects invalid details %j', async patch => {
  await expect(saveMaterialPurchase({ ...input, ...patch }, null, false)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('saves with a stable id and checks the server confirmation', async () => {
  rpc.mockResolvedValueOnce({ data: input.id }).mockResolvedValueOnce({ data: null });
  await saveMaterialPurchase(input, null, false);
  expect(rpc).toHaveBeenCalledWith('save_material_purchase', expect.objectContaining({ purchase_id: input.id, total_value: 120.5 }));
  await expect(saveMaterialPurchase(input, null, false)).rejects.toThrow('could not be confirmed');
});
it('validates receipt limits and types', () => {
  expect(() => validateMaterialReceipt(new File(['x'], 'receipt.pdf', { type: 'application/pdf' }))).not.toThrow();
  expect(() => validateMaterialReceipt(new File(['x'], 'receipt.txt', { type: 'text/plain' }))).toThrow('PDF');
  expect(() => validateMaterialReceipt(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))).toThrow('2 MB');
});
it('loads every page and surfaces database failures', async () => {
  const query = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
  query.select.mockReturnValue(query); query.order.mockReturnValue(query);
  query.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ ...input, receipt_name: null, total: '120.50' })) })
    .mockResolvedValueOnce({ data: [{ ...input, receipt_name: null, total: '120.50' }] })
    .mockResolvedValueOnce({ error: { message: 'denied' } });
  from.mockReturnValue(query);
  const results = await fetchMaterialPurchases();
  expect(results).toHaveLength(501);
  expect(results[0].total).toBe(120.5);
  await expect(fetchMaterialPurchases()).rejects.toThrow('denied');
});
it('surfaces delete errors and unconfirmed results', async () => {
  rpc.mockResolvedValueOnce({ data: input.id }).mockResolvedValueOnce({ data: null })
    .mockResolvedValueOnce({ error: { message: 'denied' } });
  await deleteMaterialPurchase(input.id);
  await expect(deleteMaterialPurchase(input.id)).rejects.toThrow('could not be confirmed');
  await expect(deleteMaterialPurchase(input.id)).rejects.toThrow('denied');
});
