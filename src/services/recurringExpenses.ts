import { loadSupabase } from '../lib/supabaseConfig';
import { expenseColumns, EXPENSE_CATEGORIES, type BusinessExpenseInput } from './businessExpenses';
import { localDate } from '../utils/date';

export const RECURRING_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type RecurringUnit = typeof RECURRING_UNITS[number];
export interface RecurringExpenseInput extends BusinessExpenseInput {
  endDate: string;
  frequencyUnit: RecurringUnit;
  frequencyInterval: number;
}
export interface RecurringExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  notes: string;
  starts_on: string;
  ends_on: string | null;
  frequency_unit: RecurringUnit;
  frequency_interval: number;
  active: boolean;
  next_due: string;
  version: number;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function client() {
  const db = await loadSupabase();
  if (!db) throw new Error('Supabase is not configured.');
  return db;
}
export async function fetchRecurringExpenses(): Promise<RecurringExpense[]> {
  const db = await client();
  const result: RecurringExpense[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('recurring_business_expenses')
      .select('id,description,category,amount,notes,starts_on,ends_on,frequency_unit,frequency_interval,active,next_due,version')
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw new Error(`Unable to load recurring expenses: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Invalid recurring expense directory.');
    for (const row of data) {
      if (!isRecord(row) || !(['id', 'description', 'notes', 'starts_on', 'next_due'] as const).every(key => typeof row[key] === 'string')
        || !EXPENSE_CATEGORIES.some(value => value === row.category) || !RECURRING_UNITS.some(value => value === row.frequency_unit)
        || (row.ends_on !== null && typeof row.ends_on !== 'string')
        || typeof row.frequency_interval !== 'number' || !Number.isInteger(row.frequency_interval) || row.frequency_interval < 1 || row.frequency_interval > 120
        || typeof row.active !== 'boolean' || typeof row.version !== 'number' || !Number.isInteger(row.version)
        || (typeof row.amount !== 'number' && typeof row.amount !== 'string')
        || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) throw new Error('Invalid recurring expense directory.');
    }
    result.push(...data.map(row => ({ ...row, amount: Number(row.amount) })));
    if (data.length < 500) return result;
  }
}
export async function createRecurringExpense(input: RecurringExpenseInput, requestId: string): Promise<void> {
  const values = expenseColumns(input);
  const end = input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null;
  if (!RECURRING_UNITS.includes(input.frequencyUnit) || !Number.isInteger(input.frequencyInterval)
    || input.frequencyInterval < 1 || input.frequencyInterval > 120
    || input.expenseDate < localDate() || input.expenseDate > '2100-12-31'
    || (end && (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== input.endDate
      || input.endDate < input.expenseDate || input.endDate > '2100-12-31'))) {
    throw new Error('Choose today or a future start date, an optional end on/after start, and a frequency from 1 to 120.');
  }
  const db = await client();
  const { data, error } = await db.rpc('create_recurring_business_expense', {
    request_id: requestId, expense_description: values.description, expense_category: values.category,
    expense_amount: values.amount, expense_notes: values.notes, start_date: values.expense_date,
    end_date: input.endDate || null, repeat_unit: input.frequencyUnit, repeat_interval: input.frequencyInterval,
  });
  if (error) throw new Error(`Unable to create recurring expense: ${error.message}`);
  if (data !== requestId) throw new Error('Schedule could not be confirmed. Retry without changing the form.');
}
export async function setRecurringExpenseActive(schedule: RecurringExpense, active: boolean): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('set_recurring_business_expense_active', {
    schedule_id: schedule.id, expected_version: schedule.version, enabled: active,
  });
  if (error) throw new Error(`Unable to update recurring expense: ${error.message}`);
  if (data !== schedule.id) throw new Error('Schedule update could not be confirmed. Refresh before retrying.');
}
