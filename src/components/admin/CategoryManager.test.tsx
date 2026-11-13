import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setCategoryVisibility } from '../../services/categories';
import CategoryManager from './CategoryManager';

vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(), deleteCategory: vi.fn(), renameCategory: vi.fn(),
  updateCategoryPresentation: vi.fn(), setCategoryVisibility: vi.fn(),
}));
vi.mock('./SeasonalCategoryEditor', () => ({ default: () => <div>Category editor open</div> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setCategoryVisibility).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('hides and restores regular and seasonal categories without removing products', async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  const categories = [
    { name: 'Bags', priority: 1, visible: true },
    { name: 'Festive', priority: 2, isSeasonal: true, visible: false, productIds: ['p1'] },
  ];
  const { rerender } = render(<CategoryManager categories={categories} onChanged={changed} />);
  fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
  expect(screen.getByText('Regular · Visible')).toBeTruthy();
  expect(screen.getByText('Seasonal · Hidden · 1 products')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Hide Bags category' }));
  await waitFor(() => expect(setCategoryVisibility).toHaveBeenCalledWith('Bags', false));
  await screen.findByText('“Bags” is hidden.');
  expect(changed).toHaveBeenCalledOnce();
  rerender(<CategoryManager categories={[{ ...categories[0], visible: false }, categories[1]]} onChanged={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show Bags category' }));
  await waitFor(() => expect(setCategoryVisibility).toHaveBeenCalledWith('Bags', true));
  await screen.findByText('“Bags” is visible.');
  fireEvent.click(screen.getByRole('button', { name: 'Show Festive category' }));
  await waitFor(() => expect(setCategoryVisibility).toHaveBeenCalledWith('Festive', true));
});

it('shows save failures and prevents visibility changes while the category editor is open', async () => {
  vi.mocked(setCategoryVisibility).mockRejectedValue(new Error('Database unavailable'));
  render(<CategoryManager categories={[{ name: 'Bags', priority: 1 }]} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Manage categories/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide Bags category' }));
  expect(await screen.findByText('Database unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit image & overview' }));
  expect(screen.getByRole('button', { name: 'Hide Bags category' })).toHaveProperty('disabled', true);
});
