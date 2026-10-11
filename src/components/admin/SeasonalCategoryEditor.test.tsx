import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SeasonalCategoryEditor from './SeasonalCategoryEditor';
import { fetchManagedProducts } from '../../services/products';
import { generateCategoryOverview, saveSeasonalCategory } from '../../services/categories';
import { products } from '../../data/products';
vi.mock('../../services/products', () => ({ fetchManagedProducts: vi.fn() }));
vi.mock('../../services/categories', () => ({ saveSeasonalCategory: vi.fn(), saveCategoryOverview: vi.fn(), generateCategoryOverview: vi.fn() }));
const category = { name: 'Navaratri', priority: 1, isSeasonal: true, productIds: ['rose'] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchManagedProducts).mockResolvedValue([
    { ...products[0], id: 'rose', name: 'Rose', category: 'Charms', published: true, imagePath: '', publishedAt: null, createdAt: '' },
    { ...products[0], id: 'flower', name: 'Flower', category: 'Decor', published: false, imagePath: '', publishedAt: null, createdAt: '' },
  ]);
  vi.mocked(saveSeasonalCategory).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('saves existing products and visibility without editing their primary categories', async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={category} onChanged={changed} onClose={close} />);
  const rose = await screen.findByLabelText('Rose · Charms');
  expect(rose).toHaveProperty('checked', true);
  fireEvent.click(screen.getByLabelText('Flower · Decor · Unpublished (not shown to shoppers)'));
  fireEvent.click(screen.getByLabelText('Show this seasonal category in the shop'));
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(saveSeasonalCategory).toHaveBeenCalledWith('Navaratri', ['rose', 'flower'], false, '', false));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(changed).toHaveBeenCalledOnce();
});
it('generates an editable overview draft without automatically publishing it', async () => {
  vi.mocked(generateCategoryOverview).mockResolvedValue('Handmade rose charms for thoughtful gifting.');
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.click(screen.getByRole('button', { name: 'Generate overview with Gemini' }));
  expect((await screen.findByRole('status')).textContent).toContain('Review and edit');
  expect(screen.getByLabelText('Category overview')).toHaveProperty('value', 'Handmade rose charms for thoughtful gifting.');
  expect(saveSeasonalCategory).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Category overview'), { target: { value: 'Reviewed overview.' } });
  fireEvent.click(screen.getByLabelText('Feature this category in the clickable store ticker'));
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(saveSeasonalCategory).toHaveBeenCalledWith('Navaratri', ['rose'], true, 'Reviewed overview.', true));
});
it('keeps selections and shows an explicit save error', async () => {
  vi.mocked(saveSeasonalCategory).mockRejectedValue(new Error('Unable to save seasonal category: Offline'));
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={close} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Offline');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Rose · Charms')).toHaveProperty('checked', true);
});
it('reports loading failures instead of allowing an empty selection to overwrite saved products', async () => {
  vi.mocked(fetchManagedProducts).mockRejectedValue(new Error('Products unavailable'));
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Products unavailable');
  expect(screen.getByRole('button', { name: 'Save seasonal category' })).toHaveProperty('disabled', true);
});
