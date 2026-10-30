import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RecurringExpensesPanel from './RecurringExpensesPanel';
import { createRecurringExpense, fetchRecurringExpenses, setRecurringExpenseActive } from '../../services/recurringExpenses';

vi.mock('../../services/recurringExpenses', async original => ({
  ...await original<typeof import('../../services/recurringExpenses')>(),
  createRecurringExpense: vi.fn(), fetchRecurringExpenses: vi.fn(), setRecurringExpenseActive: vi.fn(),
}));
const schedule = { id: 'schedule', description: 'Hosting', category: 'Subscriptions', amount: 100, notes: '',
  starts_on: '2026-10-30', ends_on: null, frequency_unit: 'months' as const, frequency_interval: 1,
  active: true, version: 1, next_due: '2026-11-30' };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(fetchRecurringExpenses).mockResolvedValue([]);
  vi.mocked(createRecurringExpense).mockResolvedValue(undefined); vi.mocked(setRecurringExpenseActive).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('defaults to monthly, supports custom frequency/end date and preserves retries without duplicate schedules', async () => {
  const refresh = vi.fn().mockResolvedValue(true); const busy = vi.fn();
  vi.mocked(createRecurringExpense).mockRejectedValueOnce(new Error('Interrupted'));
  render(<RecurringExpensesPanel loading={false} onBusyChange={busy} onExpensesChanged={refresh} />);
  await screen.findByText('No recurring expenses set up.');
  fireEvent.click(screen.getByRole('button', { name: 'Add recurring expense' }));
  expect(screen.getByLabelText('Frequency')).toHaveProperty('value', 'months');
  fireEvent.change(screen.getByLabelText('Recurring expense description'), { target: { value: 'Hosting' } });
  fireEvent.change(screen.getByLabelText('Recurring expense amount (INR)'), { target: { value: '100.25' } });
  fireEvent.change(screen.getByLabelText('Repeat every'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Last expense date (optional, inclusive)'), { target: { value: '30/10/2028' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create recurring expense' }));
  await screen.findByText('Interrupted');
  expect(screen.getByLabelText('Recurring expense description')).toHaveProperty('value', 'Hosting');
  fireEvent.submit(screen.getByRole('form', { name: 'Create recurring expense' }));
  await screen.findByText(/Recurring expense saved/);
  expect(vi.mocked(createRecurringExpense).mock.calls[0]).toEqual(vi.mocked(createRecurringExpense).mock.calls[1]);
  expect(createRecurringExpense).toHaveBeenCalledWith(expect.objectContaining({ frequencyInterval: 3, endDate: '2028-10-30', amount: 100.25 }), expect.any(String));
  expect(refresh).toHaveBeenCalledOnce(); expect(busy).toHaveBeenLastCalledWith(false);
});
it('pauses and resumes versioned schedules and refreshes expense totals', async () => {
  const refresh = vi.fn().mockResolvedValue(true);
  vi.mocked(fetchRecurringExpenses).mockResolvedValueOnce([schedule]).mockResolvedValue([{ ...schedule, active: false, version: 2 }]);
  render(<RecurringExpensesPanel loading={false} onBusyChange={vi.fn()} onExpensesChanged={refresh} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Hosting' }));
  await screen.findByText('Schedule paused. Existing expenses are unchanged.');
  expect(setRecurringExpenseActive).toHaveBeenCalledWith(schedule, false);
  fireEvent.click(await screen.findByRole('button', { name: 'Resume Hosting' }));
  await waitFor(() => expect(setRecurringExpenseActive).toHaveBeenLastCalledWith(expect.objectContaining({ version: 2 }), true));
});
it('exposes loading and refresh failures rather than empty schedules or stale success', async () => {
  vi.mocked(fetchRecurringExpenses).mockRejectedValueOnce(new Error('MFA required')).mockResolvedValue([schedule]);
  render(<RecurringExpensesPanel loading={false} onBusyChange={vi.fn()} onExpensesChanged={vi.fn().mockResolvedValue(false)} />);
  await screen.findByText(/MFA required/);
  expect(screen.queryByText('No recurring expenses set up.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh schedules' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Hosting' }));
  await screen.findByText(/Schedule saved, but expenses could not be refreshed/);
  expect(screen.queryByText('Schedule paused. Existing expenses are unchanged.')).toBeNull();
});
it('does not resume schedules past their end', async () => {
  vi.mocked(fetchRecurringExpenses).mockResolvedValue([{ ...schedule, active: false, ends_on: '2026-10-30' }]);
  render(<RecurringExpensesPanel loading={false} onBusyChange={vi.fn()} onExpensesChanged={vi.fn()} />);
  await screen.findByText('Ended - ends 30/10/2026');
  expect(screen.queryByRole('button', { name: 'Resume Hosting' })).toBeNull();
});
