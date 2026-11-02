import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerLoveManager from './CustomerLoveManager';
import { newTestimonial, type CustomerLoveRepository } from '../../services/customerLove';
import { mockNativeDialog } from './dialogTestSupport';

const entry = { ...newTestimonial(), display_name: 'Demo customer', quote: 'Such a beautiful handmade keepsake!', version: 1 };
const repository: CustomerLoveRepository = { list: vi.fn(), photo: vi.fn(), save: vi.fn(), remove: vi.fn(), syncPhotos: vi.fn() };
const products: [] = [];
let restoreDialog: () => void;
beforeEach(() => {
  restoreDialog = mockNativeDialog(); vi.clearAllMocks();
  vi.mocked(repository.list).mockResolvedValue([entry]);
  vi.mocked(repository.save).mockResolvedValue();
  vi.mocked(repository.syncPhotos).mockResolvedValue();
});
afterEach(() => { cleanup(); restoreDialog(); });

it('syncs the public R2 photo after saving and reports a failed sync with a retry', async () => {
  vi.mocked(repository.syncPhotos).mockRejectedValueOnce(new Error('R2 upload failed with status 503.'));
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Demo customer' }));
  fireEvent.submit(await screen.findByRole('form', { name: 'Testimonial editor' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    'Testimonial saved, but its public photo was not updated. R2 upload failed with status 503. Select “Sync photos to R2” to retry.');
  expect(repository.syncPhotos).toHaveBeenCalledWith(entry.id);
  fireEvent.click(screen.getByRole('button', { name: 'Sync photos to R2' }));
  await screen.findByText('Public photos are up to date in R2.');
  expect(repository.syncPhotos).toHaveBeenLastCalledWith(undefined);
});

it('adds a private draft and previews the exact quote before saving', async () => {
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add testimonial' }));
  fireEvent.change(screen.getByLabelText('Customer display name'), { target: { value: 'Happy customer' } });
  fireEvent.change(screen.getByLabelText('Customer quote'), { target: { value: 'My favourite handmade accessory.' } });
  expect(screen.getByText(/My favourite handmade accessory./, { selector: 'blockquote' })).toBeTruthy();
  fireEvent.submit(screen.getByRole('form', { name: 'Testimonial editor' }));
  await screen.findByText('Testimonial saved as a private draft.');
  expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ published: false, consent_confirmed: false }), null);
});
it('blocks publication without permission, then saves with date and source', async () => {
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Demo customer' }));
  await screen.findByRole('form', { name: 'Testimonial editor' });
  fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'published' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Testimonial editor' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Record permission, its date and source before publishing.');
  expect(repository.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText(/Customer explicitly permitted/));
  fireEvent.change(screen.getByLabelText('Permission date'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('Permission source (private)'), { target: { value: 'Written permission' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Testimonial editor' }));
  await screen.findByText('Testimonial published.');
});
it('inserts emojis at the cursor, replaces selected text and saves the exact quote', async () => {
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Demo customer' }));
  const input = await screen.findByLabelText<HTMLTextAreaElement>('Customer quote');
  fireEvent.change(input, { target: { value: 'I love this keepsake!' } });
  fireEvent.click(screen.getByText('Add emoji to quote'));
  input.setSelectionRange(7, 11);
  fireEvent.click(screen.getByRole('button', { name: 'Insert Red heart' }));
  const quote = 'I love \u2764\uFE0F keepsake!';
  expect(input.value).toBe(quote);
  expect(screen.getByText(quote, { selector: 'blockquote', exact: false })).toBeTruthy();
  await waitFor(() => expect(input.selectionStart).toBe(9));
  expect(document.activeElement).toBe(input);
  fireEvent.submit(screen.getByRole('form', { name: 'Testimonial editor' }));
  await screen.findByText('Testimonial saved as a private draft.');
  expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ quote }), null);
});
it('does not exceed the quote limit when inserting an emoji', async () => {
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Demo customer' }));
  const input = await screen.findByLabelText<HTMLTextAreaElement>('Customer quote');
  fireEvent.change(input, { target: { value: 'a'.repeat(999) } });
  input.setSelectionRange(999, 999);
  fireEvent.click(screen.getByText('Add emoji to quote'));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Red heart' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    'The quote must stay within 1,000 characters. Shorten it before adding an emoji.');
  expect(input.value).toBe('a'.repeat(999));
});
it('requires renewed permission when public content changes and preserves edits on failure', async () => {
  vi.mocked(repository.list).mockResolvedValue([{ ...entry, published: true, consent_confirmed: true,
    consent_date: '2026-01-01', consent_source: 'Written permission' }]);
  vi.mocked(repository.save).mockRejectedValue(new Error('Version conflict. Reload before saving.'));
  render(<CustomerLoveManager repository={repository} products={products} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Demo customer' }));
  await screen.findByRole('form', { name: 'Testimonial editor' });
  fireEvent.change(screen.getByLabelText('Customer quote'), { target: { value: 'Edited approved customer quote.' } });
  expect(screen.getByLabelText('Visibility')).toHaveProperty('value', 'draft');
  expect(screen.getByLabelText(/Customer explicitly permitted/)).toHaveProperty('checked', false);
  fireEvent.submit(screen.getByRole('form', { name: 'Testimonial editor' }));
  await screen.findByText('Version conflict. Reload before saving.');
  expect(screen.getByLabelText('Customer quote')).toHaveProperty('value', 'Edited approved customer quote.');
});
it('asks before deleting and surfaces load failures with retry', async () => {
  vi.mocked(repository.list).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([entry]);
  vi.mocked(repository.remove).mockResolvedValue();
  render(<CustomerLoveManager repository={repository} products={products} />);
  await screen.findByText('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry testimonials' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(repository.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => expect(repository.remove).toHaveBeenCalledWith(entry));
  await waitFor(() => expect(repository.syncPhotos).toHaveBeenCalledWith(entry.id));
});
