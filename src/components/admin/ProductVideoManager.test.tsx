import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductVideoManager from './ProductVideoManager';
import type { Product } from '../../types/product';
const { getJob, upload, remove, discard, preview, publish } = vi.hoisted(() => ({
  getJob: vi.fn(), upload: vi.fn(), remove: vi.fn(), discard: vi.fn(), preview: vi.fn(), publish: vi.fn(),
}));
vi.mock('../../services/productVideos', () => ({
  getProductVideoJob: getJob, uploadProductVideo: upload, removeProductVideo: remove,
  discardProductVideo: discard, previewProductVideo: preview, publishProductVideo: publish,
}));
const product: Product = {
  id: 'p1', name: 'Rose', category: 'Flowers', price: 200, description: 'Rose',
  color: 'red', inStock: true, image: '/photo.webp', variants: [],
  makingVideo: { videoUrl: '/published.mp4', posterUrl: '/published.webp', durationSeconds: 15, width: 1280, height: 720 },
};
beforeEach(() => {
  vi.clearAllMocks(); getJob.mockResolvedValue(null);
  remove.mockResolvedValue(undefined); publish.mockResolvedValue(undefined);
  preview.mockResolvedValue({ videoUrl: 'https://account.r2.cloudflarestorage.com/private/video.mp4?signed',
    posterUrl: 'https://account.r2.cloudflarestorage.com/private/poster.webp?signed',
    durationSeconds: 20, videoBytes: 2097152, width: 1280, height: 720, expiresAt: '' });
});
afterEach(cleanup);
it('opens the video picker from the Browse video control', async () => {
  render(<ProductVideoManager product={product} />);
  const button = screen.getByRole('button', { name: 'Browse video' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  const input = screen.getByLabelText('Upload or replace making video');
  const click = vi.spyOn(input, 'click');
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  fireEvent(input, new Event('cancel', { bubbles: true }));
  expect(upload).not.toHaveBeenCalled();
});
it('shows upload processing as private work, not automatic publication', async () => {
  render(<ProductVideoManager product={product} />);
  const input = screen.getByLabelText('Upload or replace making video') as HTMLInputElement;
  await waitFor(() => expect(input.disabled).toBe(false));
  getJob.mockResolvedValue({ id: 'j1', status: 'queued', error: null });
  upload.mockResolvedValue('j1');
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('not publish automatically'));
  expect(publish).not.toHaveBeenCalled();
  expect(input.disabled).toBe(true);
});
it('provides a playable private branded preview with duration/size before explicit Publish video', async () => {
  getJob.mockResolvedValue({ id: 'j1', status: 'review', error: null });
  const { container } = render(<ProductVideoManager product={product} />);
  const button = await screen.findByRole('button', { name: 'Publish video' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(publish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Preview processed video' }));
  await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toContain('/private/'));
  expect(container.querySelector('video')!.autoplay).toBe(false);
  expect(container.querySelector('video')!.preload).toBe('none');
  expect(container.querySelector('video')!.getAttribute('crossorigin')).toBeNull();
  expect(screen.getByText(/20.0 seconds · 2.0 MB/)).toBeTruthy();
  getJob.mockResolvedValue({ id: 'j1', status: 'ready', error: null });
  fireEvent.click(button);
  await waitFor(() => expect(publish).toHaveBeenCalledWith('j1'));
  expect(screen.getByRole('status').textContent).toContain('Video published');
});
it('does not claim successful discard until remote deletion and active writers are confirmed complete', async () => {
  getJob.mockResolvedValue({ id: 'j1', status: 'processing', error: null });
  discard.mockResolvedValue({ discarded: false, pending: true });
  render(<ProductVideoManager product={product} />);
  const button = await screen.findByRole('button', { name: 'Discard draft (delete original and processed files)' });
  getJob.mockResolvedValue({ id: 'j1', status: 'discarding', error: null });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('deletion is not complete yet'));
  expect(screen.getByRole('status').textContent).not.toContain('Draft discarded.');
  expect(remove).not.toHaveBeenCalled();
  discard.mockRejectedValueOnce(new Error('R2 deletion failed; retry discard'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry discard cleanup' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('R2 deletion failed'));
  discard.mockResolvedValue({ discarded: true });
  getJob.mockResolvedValue({ id: 'j1', status: 'cancelled', error: null });
  fireEvent.click(screen.getByRole('button', { name: 'Retry discard cleanup' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('have been deleted from R2'));
  expect(remove).not.toHaveBeenCalled();
});
it('shows encoding and publication failures, preserving the public clip and retry path', async () => {
  getJob.mockResolvedValue({ id: 'j1', status: 'review', error: 'Publication copy failed. Preview and retry.' });
  render(<ProductVideoManager product={product} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Publication copy failed');
  expect((screen.getByRole('button', { name: 'Remove published video' }) as HTMLButtonElement).disabled).toBe(false);
});
it('warns explicitly if the background worker is delayed', async () => {
  getJob.mockResolvedValue({ id: 'j1', status: 'queued', error: null, updated_at: new Date(Date.now() - 21 * 60000).toISOString() });
  render(<ProductVideoManager product={product} />);
  expect((await screen.findByRole('alert')).textContent).toContain('GitHub workflow');
});
