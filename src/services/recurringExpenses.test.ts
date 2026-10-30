import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createRecurringExpense, fetchRecurringExpenses, setRecurringExpenseActive, type RecurringExpenseInput } from './recurringExpenses';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc, from }) }));
const input: RecurringExpenseInput = { description: ' Hosting ', expenseDate: '2026-10-30', category: 'Subscriptions',
  amount: 125.5, notes: '', endDate: '', frequencyInterval: 1, frequencyUnit: 'months' };
const schedule = { id: 'schedule', description: 'Hosting', category: 'Subscriptions', amount: 125.5, notes: '',
  starts_on: '2026-10-30', ends_on: null, frequency_interval: 1, frequency_unit: 'months' as const,
  active: true, next_due: '2026-11-30', version: 1 };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 30, 12));
  rpc.mockResolvedValue({ data: 'schedule' });
});
afterEach(() => vi.useRealTimers());
it('creates a validated schedule with a stable request ID and no end date', async () => {
  await createRecurringExpense(input, 'schedule');
  expect(rpc).toHaveBeenCalledWith('create_recurring_business_expense', { request_id: 'schedule',
    expense_description: 'Hosting', expense_category: 'Subscriptions', expense_amount: 125.5, expense_notes: '',
    start_date: '2026-10-30', end_date: null, repeat_unit: 'months', repeat_interval: 1 });
});
it.each([{ amount: 0 }, { amount: NaN }, { amount: 1.001 }, { expenseDate: '2026-10-29' },
  { expenseDate: '2027-02-30' }, { endDate: '2026-10-29' }, { endDate: '2027-02-30' },
  { frequencyInterval: 0 }, { frequencyInterval: 121 }, { frequencyInterval: 1.5 }])('rejects invalid schedules: %j', async patch => {
  await expect(createRecurringExpense({ ...input, ...patch }, 'schedule')).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('uses optimistic concurrency for pause/resume and confirms receipts', async () => {
  await setRecurringExpenseActive(schedule, false);
  expect(rpc).toHaveBeenCalledWith('set_recurring_business_expense_active', { schedule_id: 'schedule', expected_version: 1, enabled: false });
  rpc.mockResolvedValueOnce({ error: { message: 'Schedule changed' } });
  await expect(setRecurringExpenseActive(schedule, true)).rejects.toThrow('Schedule changed');
  rpc.mockResolvedValueOnce({ data: 'other' });
  await expect(createRecurringExpense(input, 'schedule')).rejects.toThrow('could not be confirmed');
});
it('paginates schedules and validates numeric responses without an empty success fallback', async () => {
  const query = { select: vi.fn(), order: vi.fn(), range: vi.fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ ...schedule, amount: '125.50' })) })
    .mockResolvedValueOnce({ data: [schedule] }) };
  query.select.mockReturnValue(query); query.order.mockReturnValue(query); from.mockReturnValue(query);
  const rows = await fetchRecurringExpenses(); expect(rows).toHaveLength(501); expect(rows[0].amount).toBe(125.5);
  query.range.mockResolvedValueOnce({ data: [{}] });
  await expect(fetchRecurringExpenses()).rejects.toThrow('Invalid recurring');
  query.range.mockResolvedValueOnce({ error: { message: 'MFA required' } });
  await expect(fetchRecurringExpenses()).rejects.toThrow('MFA required');
});
