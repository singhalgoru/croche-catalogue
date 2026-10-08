import { useId, useState, type FormEvent } from 'react';
import {
  deleteBusinessExpense, saveBusinessExpense, EXPENSE_CATEGORIES,
  type BusinessExpense, type ExpenseCategory,
} from '../../services/businessExpenses';
import { formatINR } from '../../utils/currency';
import RequiredMark from './RequiredMark';
import DateInput from './DateInput';
import { formatDate } from '../../utils/date';

interface Props {
  month: string;
  expenses: BusinessExpense[];
  loading: boolean;
  onSaved: (expense: BusinessExpense) => void;
  onDeleted: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}
interface Draft {
  id?: string;
  description: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: string;
  notes: string;
}

export default function BusinessExpensesPanel({ month, expenses, loading, onSaved, onDeleted, onBusyChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const panelId = useId();
  const update = (patch: Partial<Draft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveBusinessExpense({
        ...draft, amount: Number(draft.amount),
      }, draft.id);
      onSaved(saved);
      setDraft(null);
      setMessage('Business expense saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save expense.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      await deleteBusinessExpense(id);
      onDeleted(id);
      setDeleteId(null);
      setMessage('Business expense deleted.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete expense.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <section aria-label="Business expenses" className="mt-5 rounded-2xl border border-mustard/40 bg-white p-4">
      <button type="button" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(current => !current)} disabled={busy}
        className="flex w-full items-center justify-between text-left font-heading text-xl font-bold text-cocoa">
        <span>Business expenses</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      <p className="mt-2 text-xs text-cocoa/65">
        Monthly overheads only. Do not repeat materials, labour, shipping or fees already included in sales.
        Enter the total paid, including tax; no GST credit or depreciation is calculated.
      </p>
      <div id={panelId} hidden={!expanded}>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
        <button type="button" disabled={busy || loading || draft !== null}
          onClick={() => {
            setDraft({ description: '', expenseDate: `${month}-01`, category: 'Advertising', amount: '', notes: '' });
            setError(null); setMessage(null); setDeleteId(null);
          }} className="mt-3 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
          Add expense
        </button>
        {draft && (
          <form onSubmit={event => void save(event)} className="mt-4 grid gap-3 rounded-xl bg-cream/50 p-3 sm:grid-cols-2">
            <h4 className="font-bold text-cocoa sm:col-span-2">{draft.id ? 'Edit expense' : 'New expense'}</h4>
            <label className="text-sm font-semibold text-cocoa">Description <RequiredMark />
              <input aria-label="Expense description" required maxLength={150} disabled={busy} value={draft.description}
                onChange={event => update({ description: event.target.value })}
                className="mt-1 w-full rounded-lg border border-mustard/50 px-3 py-2" />
            </label>
            <label className="text-sm font-semibold text-cocoa">Date <RequiredMark />
              <DateInput aria-label="Expense date" required disabled={busy} value={draft.expenseDate}
                onChange={expenseDate => update({ expenseDate })}
                className="mt-1 w-full min-w-0 rounded-lg border border-mustard/50 px-3 py-2" />
            </label>
            <label className="text-sm font-semibold text-cocoa">Category <RequiredMark />
              <select aria-label="Expense category" required disabled={busy} value={draft.category}
                onChange={event => {
                  const category = EXPENSE_CATEGORIES.find(item => item === event.target.value);
                  if (category) update({ category });
                }} className="mt-1 w-full rounded-lg border border-mustard/50 px-3 py-2">
                {EXPENSE_CATEGORIES.map(category => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-cocoa">Amount paid (₹) <RequiredMark />
              <input aria-label="Expense amount" type="number" inputMode="decimal" required min="0.01" max="9999999999.99"
                step="0.01" disabled={busy} value={draft.amount} onChange={event => update({ amount: event.target.value })}
                className="mt-1 w-full rounded-lg border border-mustard/50 px-3 py-2" />
            </label>
            <label className="text-sm font-semibold text-cocoa sm:col-span-2">Notes
              <textarea aria-label="Expense notes" maxLength={1000} disabled={busy} value={draft.notes}
                onChange={event => update({ notes: event.target.value })}
                className="mt-1 w-full rounded-lg border border-mustard/50 px-3 py-2" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={busy || loading} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
                {busy ? 'Saving…' : 'Save expense'}
              </button>
              <button type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}
                className="rounded-full border border-cocoa/30 px-4 py-2 text-sm text-cocoa">Cancel expense</button>
            </div>
          </form>
        )}
        {loading ? <p className="mt-3 text-sm text-cocoa/65">Expense data unavailable or loading. Refresh the dashboard to retry.</p> : (
          <>
            <p className="mt-3 text-sm font-semibold text-cocoa">
              {month}: {expenses.length} expense{expenses.length === 1 ? '' : 's'} · {formatINR(expenses.reduce((total, expense) => total + expense.amount, 0))}
            </p>
            {expenses.length === 0 && <p className="mt-2 text-sm text-cocoa/65">No business expenses recorded for this month.</p>}
            <ul className="mt-3 space-y-2">
              {expenses.map(expense => (
                <li key={expense.id} className="rounded-xl border border-cocoa/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 break-words text-sm text-cocoa">
                      <strong>{expense.description} · {formatINR(expense.amount)}</strong>
                      <p>{formatDate(expense.expenseDate)} · {expense.category}</p>
                      {expense.notes && <p className="mt-1 whitespace-pre-wrap">{expense.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || draft !== null} aria-label={`Edit expense ${expense.description}`}
                        onClick={() => { setDraft({ ...expense, amount: String(expense.amount) }); setDeleteId(null); setError(null); setMessage(null); }}
                        className="rounded-full border border-cocoa/30 px-3 py-1 text-sm text-cocoa disabled:opacity-50">Edit</button>
                      <button type="button" disabled={busy || draft !== null} aria-label={`Delete expense ${expense.description}`}
                        onClick={() => setDeleteId(expense.id)}
                        className="rounded-full border border-red-200 px-3 py-1 text-sm text-red-800 disabled:opacity-50">Delete</button>
                    </div>
                  </div>
                  {deleteId === expense.id && (
                    <div className="mt-3 text-sm text-red-800">
                      <p>Delete this expense? Monthly profit will be recalculated.</p>
                      <button type="button" disabled={busy || loading} onClick={() => void remove(expense.id)} className="mr-3 mt-2 font-bold underline">Confirm delete expense</button>
                      <button type="button" disabled={busy} onClick={() => setDeleteId(null)} className="underline">Cancel delete expense</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
