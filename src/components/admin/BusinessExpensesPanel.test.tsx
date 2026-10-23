import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BusinessExpensesPanel from './BusinessExpensesPanel';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('defaults each new expense to the current local date, regardless of the selected report month', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 0, 5));
  render(<BusinessExpensesPanel month="2026-09" expenses={[]} loading={false}
    onSaved={vi.fn()} onDeleted={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Business expenses' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(screen.getByLabelText('Expense date')).toHaveProperty('value', '23/10/2026');
  fireEvent.change(screen.getByLabelText('Expense date'), { target: { value: '15/09/2026' } });
  expect(screen.getByLabelText('Expense date')).toHaveProperty('value', '15/09/2026');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel expense' }));
  vi.setSystemTime(new Date(2026, 9, 24, 0, 5));
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(screen.getByLabelText('Expense date')).toHaveProperty('value', '24/10/2026');
});

it('preserves the saved date when editing an existing expense', () => {
  render(<BusinessExpensesPanel month="2026-09" expenses={[{
    id: 'expense-1', description: 'Ads', expenseDate: '2026-09-15',
    category: 'Advertising', amount: 100, notes: '',
  }]} loading={false} onSaved={vi.fn()} onDeleted={vi.fn()} onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Business expenses' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit expense Ads' }));
  expect(screen.getByLabelText('Expense date')).toHaveProperty('value', '15/09/2026');
});
