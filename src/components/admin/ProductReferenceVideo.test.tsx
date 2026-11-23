import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductReferenceVideo from './ProductReferenceVideo';
import { fetchReferenceVideo, saveReferenceVideo } from '../../services/productReferenceVideo';
import { mockNativeDialog } from './dialogTestSupport';

vi.mock('../../services/productReferenceVideo', () => ({
  fetchReferenceVideo: vi.fn(), saveReferenceVideo: vi.fn(),
}));
let restoreDialog: () => void;
beforeEach(() => {
  vi.resetAllMocks();
  restoreDialog = mockNativeDialog();
});
afterEach(() => { cleanup(); restoreDialog(); });

it('saves, reopens, edits and removes the reference link for the product', async () => {
  vi.mocked(fetchReferenceVideo).mockResolvedValueOnce(null)
    .mockResolvedValueOnce('https://youtu.be/first');
  vi.mocked(saveReferenceVideo).mockResolvedValueOnce('https://youtu.be/first')
    .mockResolvedValueOnce('https://youtu.be/second').mockResolvedValueOnce(null);
  render(<ProductReferenceVideo product={{ id: 'p1', name: 'Hat' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reference video' }));
  let dialog = screen.getByRole('dialog', { name: 'Reference video - Hat' });
  const input = await within(dialog).findByLabelText('Video link');
  fireEvent.change(input, { target: { value: 'https://youtu.be/first' } });
  fireEvent.submit(input.closest('form')!);
  await screen.findByText('Reference video link saved.');
  expect(saveReferenceVideo).toHaveBeenCalledWith('p1', null, 'https://youtu.be/first');
  expect(screen.getByRole('link', { name: 'Open saved video' }).getAttribute('href')).toBe('https://youtu.be/first');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close Reference video - Hat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reference video' }));
  dialog = screen.getByRole('dialog', { name: 'Reference video - Hat' });
  const reopened = await within(dialog).findByLabelText('Video link');
  expect(reopened).toHaveProperty('value', 'https://youtu.be/first');
  fireEvent.change(reopened, { target: { value: 'https://youtu.be/second' } });
  fireEvent.submit(reopened.closest('form')!);
  await waitFor(() => expect(saveReferenceVideo).toHaveBeenCalledWith('p1', 'https://youtu.be/first', 'https://youtu.be/second'));
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open saved video' }).getAttribute('href')).toBe('https://youtu.be/second'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await screen.findByText('Reference video link removed.');
  expect(saveReferenceVideo).toHaveBeenLastCalledWith('p1', 'https://youtu.be/second', null);
  expect(screen.queryByRole('link', { name: 'Open saved video' })).toBeNull();
});

it('shows load and save errors, preserves the draft and allows refreshing a stale link', async () => {
  vi.mocked(fetchReferenceVideo).mockRejectedValueOnce(new Error('Cannot load link'))
    .mockResolvedValueOnce('https://example.test/old')
    .mockResolvedValueOnce('https://example.test/new');
  vi.mocked(saveReferenceVideo).mockRejectedValueOnce(new Error('Reference video changed. Refresh before saving.'));
  render(<ProductReferenceVideo product={{ id: 'p1', name: 'Hat' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reference video' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Cannot load link');
  expect(screen.queryByLabelText('Video link')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh saved link' }));
  const input = await screen.findByLabelText('Video link');
  fireEvent.change(input, { target: { value: 'https://example.test/draft' } });
  fireEvent.submit(input.closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toContain('changed');
  expect(input).toHaveProperty('value', 'https://example.test/draft');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh saved link' }));
  await waitFor(() => expect(input).toHaveProperty('value', 'https://example.test/new'));
});
