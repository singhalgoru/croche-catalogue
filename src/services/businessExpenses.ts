import { loadSupabase } from '../lib/supabaseConfig';

export const EXPENSE_CATEGORIES = [
  'Advertising', 'Tools & equipment', 'Subscriptions', 'Rent & utilities', 'Travel', 'Other',
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export interface BusinessExpense {
  id: string;
  description: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  notes: string;
}
export type BusinessExpenseInput = Omit<BusinessExpense, 'id'>;
interface ExpenseRow {
  id: string;
  description: string;
  expense_date: string;
  category: ExpenseCategory;
  amount: number | string;
  notes: string;
}
const columns = 'id,description,expense_date,category,amount,notes';
const mapExpense = (row: ExpenseRow): BusinessExpense => ({
  id: row.id, description: row.description, expenseDate: row.expense_date,
  category: row.category, amount: Number(row.amount), notes: row.notes,
});
const requireClient = async () => {
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
};
const expenseColumns = (input: BusinessExpenseInput) => {
  if (!input.description.trim() || input.description.trim().length > 150) {
    throw new Error('Enter an expense description of at most 150 characters.');
  }
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new Error('Choose a valid expense category.');
  }
  const date = new Date(`${input.expenseDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.expenseDate) {
    throw new Error('Enter a valid expense date.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount >= 1e10
    || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.0001) {
    throw new Error('Expense amount must be positive, below ₹10 billion and have at most two decimal places.');
  }
  if (input.notes.length > 1000) throw new Error('Expense notes must be at most 1,000 characters.');
  return {
    description: input.description.trim(), expense_date: input.expenseDate,
    category: input.category, amount: input.amount, notes: input.notes.trim(),
    updated_at: new Date().toISOString(),
  };
};

export async function fetchBusinessExpenses(): Promise<BusinessExpense[]> {
  const client = await requireClient();
  const expenses: BusinessExpense[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('business_expenses').select(columns)
      .order('expense_date', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw new Error(`Unable to load business expenses: ${error.message}`);
    const rows = data as ExpenseRow[];
    expenses.push(...rows.map(mapExpense));
    if (rows.length < 500) return expenses;
  }
}

export async function saveBusinessExpense(input: BusinessExpenseInput, id?: string): Promise<BusinessExpense> {
  const values = expenseColumns(input);
  const client = await requireClient();
  const table = client.from('business_expenses');
  const query = id ? table.update(values).eq('id', id) : table.insert(values);
  const { data, error } = await query.select(columns).single();
  if (error) throw new Error(`Unable to save business expense: ${error.message}`);
  return mapExpense(data as ExpenseRow);
}

export async function deleteBusinessExpense(id: string): Promise<void> {
  const client = await requireClient();
  const { data, error } = await client.from('business_expenses').delete().eq('id', id).select('id');
  if (error) throw new Error(`Unable to delete business expense: ${error.message}`);
  if (!data?.length) throw new Error('Expense was not deleted. Refresh the dashboard and try again.');
}
