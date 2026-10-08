import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteBusinessExpense, fetchBusinessExpenses, saveBusinessExpense, type BusinessExpenseInput } from './businessExpenses';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ from }) }));
const input: BusinessExpenseInput = {
  description: ' Ads ', expenseDate: '2026-10-08', category: 'Advertising', amount: 100.25, notes: 'October',
};
const row = { id: 'expense-1', description: 'Ads', expense_date: input.expenseDate, category: input.category, amount: '100.25', notes: input.notes };
beforeEach(() => from.mockReset());

describe('business expense persistence', () => {
  it.each([undefined, 'expense-1'])('saves validated amounts to the private ledger (id %s)', async id => {
    const query = {
      insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
    };
    for (const method of [query.insert, query.update, query.eq, query.select]) method.mockReturnValue(query);
    from.mockReturnValue(query);
    expect(await saveBusinessExpense(input, id)).toMatchObject({ amount: 100.25, description: 'Ads' });
    expect(from).toHaveBeenCalledWith('business_expenses');
    expect(id ? query.update : query.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 100.25, description: 'Ads' }));
    if (id) expect(query.eq).toHaveBeenCalledWith('id', id);
  });

  it.each([
    { description: '' }, { amount: 0 }, { amount: -1 }, { amount: NaN },
    { amount: 1e10 }, { amount: 1.001 }, { expenseDate: '2026-02-30' },
    { expenseDate: '' }, { notes: 'x'.repeat(1001) },
  ])('rejects invalid input %j before querying', async patch => {
    await expect(saveBusinessExpense({ ...input, ...patch })).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it('loads every page and maps decimal amounts', async () => {
    const query = {
      select: vi.fn(), order: vi.fn(),
      range: vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => row), error: null })
        .mockResolvedValueOnce({ data: [row], error: null }),
    };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    from.mockReturnValue(query);
    const results = await fetchBusinessExpenses();
    expect(results).toHaveLength(501);
    expect(results[0].amount).toBe(100.25);
    expect(query.range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it('surfaces load failures instead of returning an empty ledger', async () => {
    const query = { select: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }) };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    from.mockReturnValue(query);
    await expect(fetchBusinessExpenses()).rejects.toThrow('denied');
  });

  it('verifies delete affects an expense and reports failures', async () => {
    const query = { delete: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue({ data: [{ id: row.id }], error: null }) };
    query.delete.mockReturnValue(query); query.eq.mockReturnValue(query); from.mockReturnValue(query);
    await deleteBusinessExpense(row.id);
    expect(query.eq).toHaveBeenCalledWith('id', row.id);
    query.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(deleteBusinessExpense(row.id)).rejects.toThrow('not deleted');
    query.select.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(deleteBusinessExpense(row.id)).rejects.toThrow('denied');
  });
});
