import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SeasonalCategoryEditor from './SeasonalCategoryEditor';
import { fetchManagedProducts } from '../../services/products';
import { generateCategoryOverview, removeSeasonalCategoryImages, saveSeasonalCategory, uploadSeasonalCategoryImage } from '../../services/categories';
import { products } from '../../data/products';
vi.mock('../../services/products', () => ({ fetchManagedProducts: vi.fn() }));
vi.mock('../../services/categories', () => ({ saveSeasonalCategory: vi.fn(), saveCategoryOverview: vi.fn(), generateCategoryOverview: vi.fn(), uploadSeasonalCategoryImage: vi.fn(), removeSeasonalCategoryImages: vi.fn() }));
const category = { name: 'Navaratri', priority: 1, isSeasonal: true, productIds: ['rose'] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:cover-preview');
    static revokeObjectURL = vi.fn();
  });
  vi.mocked(fetchManagedProducts).mockResolvedValue([
    { ...products[0], id: 'rose', name: 'Rose', category: 'Charms', published: true, imagePath: '', publishedAt: null, createdAt: '' },
    { ...products[0], id: 'flower', name: 'Flower', category: 'Decor', published: false, imagePath: '', publishedAt: null, createdAt: '' },
  ]);
  vi.mocked(saveSeasonalCategory).mockResolvedValue('');
  vi.mocked(removeSeasonalCategoryImages).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('saves existing products and visibility without editing their primary categories', async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={category} onChanged={changed} onClose={close} />);
  const rose = await screen.findByLabelText('Rose · Charms');
  expect(rose).toHaveProperty('checked', true);
  fireEvent.click(screen.getByLabelText('Flower · Decor · Unpublished (not shown to shoppers)'));
  fireEvent.click(screen.getByLabelText('Show this seasonal category in the shop'));
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(saveSeasonalCategory).toHaveBeenCalledWith('Navaratri', ['rose', 'flower'], false, '', false, ''));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(changed).toHaveBeenCalledOnce();
});
it('generates an editable overview draft without automatically publishing it', async () => {
  vi.mocked(generateCategoryOverview).mockResolvedValue('Handmade rose charms for thoughtful gifting.');
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.click(screen.getByRole('button', { name: 'Generate overview with AI' }));
  expect((await screen.findByRole('status')).textContent).toContain('Review and edit');
  expect(screen.getByLabelText('Category overview')).toHaveProperty('value', 'Handmade rose charms for thoughtful gifting.');
  expect(saveSeasonalCategory).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Category overview'), { target: { value: 'Reviewed overview.' } });
  fireEvent.click(screen.getByLabelText('Feature this category in the clickable store ticker'));
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(saveSeasonalCategory).toHaveBeenCalledWith('Navaratri', ['rose'], true, 'Reviewed overview.', true, ''));
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
it('retains the current overview and product selection when all AI providers fail', async () => {
  vi.mocked(generateCategoryOverview).mockRejectedValueOnce(new Error('Gemini is unavailable. Cloudflare is busy.'));
  render(<SeasonalCategoryEditor category={{ ...category, overview: 'Keep this reviewed overview.' }} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.click(screen.getByRole('button', { name: 'Generate overview with AI' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Cloudflare is busy');
  expect(screen.getByLabelText('Category overview')).toHaveProperty('value', 'Keep this reviewed overview.');
  expect(screen.getByLabelText('Rose · Charms')).toHaveProperty('checked', true);
  expect(saveSeasonalCategory).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Generate overview with AI' })).toHaveProperty('disabled', false);
});
it('reports loading failures instead of allowing an empty selection to overwrite saved products', async () => {
  vi.mocked(fetchManagedProducts).mockRejectedValue(new Error('Products unavailable'));
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Products unavailable');
  expect(screen.getByRole('button', { name: 'Save seasonal category' })).toHaveProperty('disabled', true);
});

it('previews a new cover, uploads on save and preserves the uploaded draft after a failed save', async () => {
  const image = 'https://images.luviacreations.com/products/admin/season.webp';
  vi.mocked(uploadSeasonalCategoryImage).mockResolvedValue(image);
  vi.mocked(saveSeasonalCategory).mockRejectedValueOnce(new Error('Save denied')).mockResolvedValueOnce('');
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={close} />);
  await screen.findByLabelText('Rose · Charms');
  const file = new File(['cover'], 'season.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Seasonal collection cover image'), { target: { files: [file] } });
  expect(screen.getByAltText('Navaratri cover preview').getAttribute('src')).toBe('blob:cover-preview');
  expect(uploadSeasonalCategoryImage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Save denied');
  expect(close).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByAltText('Navaratri cover preview').getAttribute('src')).toBe(image));
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(uploadSeasonalCategoryImage).toHaveBeenCalledExactlyOnceWith(file);
  expect(saveSeasonalCategory).toHaveBeenLastCalledWith('Navaratri', ['rose'], true, '', false, image);
});

it('removes an existing cover only when the category is saved', async () => {
  render(<SeasonalCategoryEditor category={{ ...category, coverImage: 'https://images.luviacreations.com/products/admin/old.webp' }} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.click(screen.getByRole('button', { name: 'Remove cover image' }));
  expect(screen.queryByAltText('Navaratri cover preview')).toBeNull();
  expect(saveSeasonalCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await waitFor(() => expect(saveSeasonalCategory).toHaveBeenCalledWith('Navaratri', ['rose'], true, '', false, ''));
});

it('reports upload failure without saving the category or losing the selected file', async () => {
  vi.mocked(uploadSeasonalCategoryImage).mockRejectedValue(new Error('Upload unavailable'));
  render(<SeasonalCategoryEditor category={category} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.change(screen.getByLabelText('Seasonal collection cover image'), {
    target: { files: [new File(['cover'], 'season.png', { type: 'image/png' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Upload unavailable');
  expect(saveSeasonalCategory).not.toHaveBeenCalled();
  expect(screen.getByText('season.png')).toBeTruthy();
});

it('rejects oversized or unsupported cover files without replacing the saved preview', async () => {
  render(<SeasonalCategoryEditor category={{ ...category, coverImage: '/old.webp' }} onChanged={vi.fn()} onClose={vi.fn()} />);
  await screen.findByLabelText('Rose · Charms');
  for (const file of [new File(['svg'], 'cover.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
    fireEvent.change(screen.getByLabelText('Seasonal collection cover image'), { target: { files: [file] } });
    expect(screen.getByRole('alert').textContent).toContain('6 MB');
    expect(screen.getByAltText('Navaratri cover preview').getAttribute('src')).toBe('/old.webp');
  }
});

it('cleans all old cover renditions only after the replacement save is confirmed, with retry on failure', async () => {
  const old = 'https://images.luviacreations.com/products/admin/old.webp';
  const image = 'https://images.luviacreations.com/products/admin/new.webp';
  vi.mocked(uploadSeasonalCategoryImage).mockResolvedValue(image);
  vi.mocked(saveSeasonalCategory).mockResolvedValue(old);
  vi.mocked(removeSeasonalCategoryImages).mockRejectedValueOnce(new Error('R2 unavailable')).mockResolvedValueOnce(undefined);
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={{ ...category, coverImage: old }} onChanged={vi.fn()} onClose={close} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.change(screen.getByLabelText('Seasonal collection cover image'), {
    target: { files: [new File(['cover'], 'new.png', { type: 'image/png' })] },
  });
  expect(removeSeasonalCategoryImages).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Category saved');
  expect(removeSeasonalCategoryImages).toHaveBeenCalledWith([old]);
  expect(vi.mocked(saveSeasonalCategory).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(removeSeasonalCategoryImages).mock.invocationCallOrder[0]);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry old cover cleanup' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(saveSeasonalCategory).toHaveBeenCalledOnce();
});

it('does not delete the stored cover after a failed save and cleans the unused uploaded draft on cancel', async () => {
  const old = 'https://images.luviacreations.com/products/admin/old.webp';
  const image = 'https://images.luviacreations.com/products/admin/new.webp';
  vi.mocked(uploadSeasonalCategoryImage).mockResolvedValue(image);
  vi.mocked(saveSeasonalCategory).mockRejectedValue(new Error('Save denied'));
  const close = vi.fn();
  render(<SeasonalCategoryEditor category={{ ...category, coverImage: old }} onChanged={vi.fn()} onClose={close} />);
  await screen.findByLabelText('Rose · Charms');
  fireEvent.change(screen.getByLabelText('Seasonal collection cover image'), {
    target: { files: [new File(['cover'], 'new.png', { type: 'image/png' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save seasonal category' }));
  await screen.findByRole('alert');
  expect(removeSeasonalCategoryImages).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(removeSeasonalCategoryImages).toHaveBeenCalledExactlyOnceWith([image]);
});
