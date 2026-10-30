import { useEffect, useRef, useState } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../services/businessExpenses';
import { createRecurringExpense, fetchRecurringExpenses, RECURRING_UNITS, setRecurringExpenseActive,
  type RecurringExpense, type RecurringUnit } from '../../services/recurringExpenses';
import { formatDate, localDate } from '../../utils/date';
import { formatINR } from '../../utils/currency';
import DateInput from './DateInput';

interface Draft {
  description: string;
  category: ExpenseCategory;
  amount: string;
  expenseDate: string;
  endDate: string;
  frequencyInterval: string;
  frequencyUnit: RecurringUnit;
  notes: string;
}
const inputClass = 'mt-1 block min-h-11 w-full rounded-lg border border-mustard/50 px-3 py-2';
const buttonClass = 'min-h-11 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50';
export default function RecurringExpensesPanel({ loading, onBusyChange, onExpensesChanged }: {
  loading: boolean;
  onBusyChange: (busy: boolean) => void;
  onExpensesChanged: () => Promise<boolean>;
}) {
  const [rows, setRows] = useState<RecurringExpense[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const request = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetchRecurringExpenses().then(result => { if (active) { setRows(result); setLoadError(''); } })
      .catch(failure => { if (active) setLoadError(failure instanceof Error ? failure.message : 'Unable to load recurring expenses.'); })
      .finally(() => { if (active) setLoadingSchedules(false); });
    return () => { active = false; };
  }, [refresh]);
  const reload = () => { setLoadingSchedules(true); setRefresh(value => value + 1); };
  const update = (patch: Partial<Draft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      await action();
      reload();
      if (!await onExpensesChanged()) throw new Error('Schedule saved, but expenses could not be refreshed. Refresh the dashboard before checking totals.');
      setMessage(success);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update recurring expenses.'); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return <section aria-label="Recurring business expenses" className="mt-5 space-y-3 rounded-xl border border-mustard/40 p-3">
    <h4 className="font-heading text-lg font-bold">Recurring expenses</h4>
    <p className="text-xs">Automatically record a fixed overhead on its due date, even with this console closed. This records an expense, not a payment or bank transfer. Do not duplicate costs already recorded in sales.</p>
    <p className="text-xs">Entries are generated hourly using India time. Monthly/yearly schedules keep the original day, using the last day for shorter months. Pausing skips due dates while paused; resuming does not backfill them. To change an amount or frequency, pause the old schedule and create a replacement.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className={buttonClass} disabled={busy || loading || Boolean(draft)} onClick={() => {
        setDraft({ description: '', category: 'Subscriptions', amount: '', expenseDate: localDate(), endDate: '',
          frequencyInterval: '1', frequencyUnit: 'months', notes: '' });
        request.current = null; setError(''); setMessage('');
      }}>Add recurring expense</button>
      <button type="button" disabled={busy || loadingSchedules} className="min-h-11 underline" onClick={reload}>Refresh schedules</button>
    </div>
    {draft && <form aria-label="Create recurring expense" className="grid gap-3 rounded-xl bg-cream/50 p-3 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        const signature = JSON.stringify(draft);
        if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
        await createRecurringExpense({ ...draft, amount: Number(draft.amount), frequencyInterval: Number(draft.frequencyInterval) }, request.current.id);
        setDraft(null); request.current = null;
      }, 'Recurring expense saved. Due entries appear in the expense list; future entries are automatic.');
    }}>
      <fieldset disabled={busy || loading} className="contents">
        <label className="text-sm font-semibold">Recurring expense description<input required maxLength={150} value={draft.description}
          onChange={event => update({ description: event.target.value })} className={inputClass} /></label>
        <label className="text-sm font-semibold">Recurring expense category<select value={draft.category} onChange={event => {
          const category = EXPENSE_CATEGORIES.find(value => value === event.target.value);
          if (category) update({ category });
        }} className={inputClass}>{EXPENSE_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-semibold">Recurring expense amount (INR)<input required type="number" min="0.01" max="9999999999.99" step="0.01"
          value={draft.amount} onChange={event => update({ amount: event.target.value })} className={inputClass} /></label>
        <label className="text-sm font-semibold">First expense date<DateInput required value={draft.expenseDate}
          onChange={expenseDate => update({ expenseDate })} className={inputClass} /></label>
        <label className="text-sm font-semibold">Repeat every<input required type="number" min="1" max="120" step="1"
          value={draft.frequencyInterval} onChange={event => update({ frequencyInterval: event.target.value })} className={inputClass} /></label>
        <div className="text-sm font-semibold"><label htmlFor="recurring-expense-unit">Frequency</label>
          <select id="recurring-expense-unit" value={draft.frequencyUnit} onChange={event => {
            const frequencyUnit = RECURRING_UNITS.find(value => value === event.target.value);
            if (frequencyUnit) update({ frequencyUnit });
          }} className={inputClass}>{RECURRING_UNITS.map(value => <option key={value}>{value}</option>)}</select>
        </div>
        <label className="text-sm font-semibold">Last expense date (optional, inclusive)<DateInput value={draft.endDate}
          onChange={endDate => update({ endDate })} className={inputClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Recurring expense notes<textarea maxLength={1000} value={draft.notes}
          onChange={event => update({ notes: event.target.value })} className={inputClass} /></label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className={buttonClass}>Save recurring expense</button>
          <button type="button" className="min-h-11 underline" onClick={() => { setDraft(null); request.current = null; setError(''); }}>Cancel recurring expense</button>
        </div>
      </fieldset>
    </form>}
    {loadingSchedules ? <p role="status" className="text-sm">Loading recurring schedules...</p> : loadError
      ? <p role="alert" className="text-red-700">{loadError} Use Refresh schedules to retry.</p>
      : rows.length === 0 ? <p className="text-sm">No recurring expenses set up.</p>
        : <ul className="space-y-2">{rows.map(schedule => {
          const ended = Boolean(schedule.ends_on && (schedule.next_due > schedule.ends_on || schedule.ends_on < localDate()));
          return <li key={schedule.id} className="space-y-1 rounded border p-3 text-sm">
            <p className="break-words font-semibold">{schedule.description} - {formatINR(schedule.amount)}</p>
            <p>Every {schedule.frequency_interval} {schedule.frequency_unit} from {formatDate(schedule.starts_on)} - {schedule.category}</p>
            <p>{ended ? 'Ended' : schedule.active ? `Active - next due ${formatDate(schedule.next_due)}` : 'Paused'}
              {schedule.ends_on ? ` - ends ${formatDate(schedule.ends_on)}` : ''}</p>
            {schedule.notes && <p className="whitespace-pre-wrap break-words">{schedule.notes}</p>}
            {!ended && <button type="button" disabled={busy || loading} className="min-h-11 underline" onClick={() => void run(
              () => setRecurringExpenseActive(schedule, !schedule.active), schedule.active ? 'Schedule paused. Existing expenses are unchanged.' : 'Schedule resumed. Paused dates were skipped.',
            )}>{schedule.active ? 'Pause' : 'Resume'} {schedule.description}</button>}
          </li>;
        })}</ul>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" className="text-green-800">{message}</p>}
  </section>;
}
