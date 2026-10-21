import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import ProductVideoManager from './ProductVideoManager';
import AdminDialog from './AdminDialog';
import { mockNativeDialog } from './dialogTestSupport';
import type { Product } from '../../types/product';
const { getJob, upload, remove, discard, preview, publish, reprocess, rename } = vi.hoisted(() => ({
  getJob: vi.fn(), upload: vi.fn(), remove: vi.fn(), discard: vi.fn(), preview: vi.fn(), publish: vi.fn(),
  reprocess: vi.fn(), rename: vi.fn(),
}));
vi.mock('../../services/productVideos', () => ({
  getProductVideoJob: getJob, uploadProductVideo: upload, removeProductVideo: remove,
  discardProductVideo: discard, previewProductVideo: preview, publishProductVideo: publish,
  reprocessProductVideo: reprocess, renameProductVideo: rename, validateMusicFile: vi.fn(),
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
it('saves an individual video title independently of uploading or publishing', async () => {
  rename.mockResolvedValue(undefined);
  render(<ProductVideoManager product={{ ...product, makingVideo: { ...product.makingVideo!, title: 'Old title' } }} />);
  const save = screen.getByRole('button', { name: 'Save video title' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  expect(screen.getByLabelText('Video title')).toHaveProperty('value', 'Old title');
  fireEvent.change(screen.getByLabelText('Video title'), { target: { value: '  Making a rose  ' } });
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Video title saved'));
  expect(rename).toHaveBeenCalledWith('p1', '  Making a rose  ');
  expect(screen.getByLabelText('Video title')).toHaveProperty('value', 'Making a rose');
  expect(upload).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
it('retains the edited title and shows errors if renaming fails', async () => {
  rename.mockRejectedValueOnce(new Error('Rename unavailable'));
  render(<ProductVideoManager product={product} />);
  const save = screen.getByRole('button', { name: 'Save video title' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'My video' } });
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Rename unavailable');
  expect(screen.getByLabelText('Video title')).toHaveProperty('value', 'My video');
});
it('does not offer renaming before a video is published', async () => {
  render(<ProductVideoManager product={{ ...product, makingVideo: undefined }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Browse video' })).toHaveProperty('disabled', false));
  expect(screen.queryByLabelText('Video title')).toBeNull();
});
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
it('defaults every new upload to the Luvia track and supports explicit No music', async () => {
  render(<ProductVideoManager product={product} />);
  const browse = screen.getByRole('button', { name: 'Browse video' }) as HTMLButtonElement;
  await waitFor(() => expect(browse.disabled).toBe(false));
  expect((screen.getByRole('radio', { name: /Luvia gentle instrumental \(default\)/ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/original sound of every video .* is always removed/)).toBeTruthy();
  expect(screen.queryByLabelText('Music mode')).toBeNull();
  const video = new File(['video'], 'a.mp4', { type: 'video/mp4' });
  fireEvent.change(screen.getByLabelText('Upload or replace making video'), { target: { files: [video] } });
  await waitFor(() => expect(upload).toHaveBeenCalledWith('p1', video, { source: 'brand' }));
  await waitFor(() => expect(browse.disabled).toBe(false));
  fireEvent.click(screen.getByRole('radio', { name: /No music/ }));
  fireEvent.change(screen.getByLabelText('Upload or replace making video'), { target: { files: [video] } });
  await waitFor(() => expect(upload).toHaveBeenLastCalledWith('p1', video, undefined));
});
it('uses a styled Browse audio control; cancelling keeps the dialog and uploads nothing', async () => {
  const onClose = vi.fn();
  const restore = mockNativeDialog();
  onTestFinished(restore);
  render(<AdminDialog title="Edit product" onClose={onClose}><ProductVideoManager product={product} /></AdminDialog>);
  const browse = screen.getByRole('button', { name: 'Browse video' }) as HTMLButtonElement;
  await waitFor(() => expect(browse.disabled).toBe(false));
  fireEvent.click(screen.getByRole('radio', { name: 'Upload my own music' }));
  expect(browse.disabled).toBe(true);
  const audioInput = screen.getByLabelText('Music file') as HTMLInputElement;
  expect(audioInput.className).toContain('sr-only');
  const click = vi.spyOn(audioInput, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Browse audio' }));
  expect(click).toHaveBeenCalledOnce();
  const cancel = new Event('cancel', { bubbles: true });
  fireEvent(audioInput, cancel);
  fireEvent.change(audioInput, { target: { files: [] } });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toHaveProperty('open', true);
  expect(upload).not.toHaveBeenCalled();
  expect(browse.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Browse audio' })).toBeTruthy();
});
it('shows the chosen custom audio, requires permission, supports change/remove and overrides the default', async () => {
  render(<ProductVideoManager product={product} />);
  const browse = screen.getByRole('button', { name: 'Browse video' }) as HTMLButtonElement;
  await waitFor(() => expect(browse.disabled).toBe(false));
  fireEvent.click(screen.getByRole('radio', { name: 'Upload my own music' }));
  const track = new File(['music'], 'track.mp3', { type: 'audio/mpeg' });
  fireEvent.change(screen.getByLabelText('Music file'), { target: { files: [track] } });
  expect(screen.getByText('track.mp3')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Change audio' })).toBeTruthy();
  expect(browse.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /I own this music/ }));
  expect(browse.disabled).toBe(false);
  const video = new File(['video'], 'a.mp4', { type: 'video/mp4' });
  fireEvent.change(screen.getByLabelText('Upload or replace making video'), { target: { files: [video] } });
  await waitFor(() => expect(upload).toHaveBeenCalledWith('p1', video, { file: track, rightsConfirmed: true }));
  await waitFor(() => expect(browse.disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Remove audio' }));
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('track.mp3')).toBeNull();
  expect(browse.disabled).toBe(true);
});
it('keeps reprocessing available until publication and explains post-publication original deletion', async () => {
  getJob.mockResolvedValue({ id: 'j1', status: 'review', error: null });
  render(<ProductVideoManager product={product} />);
  await screen.findByRole('button', { name: 'Preview processed video' });
  expect(screen.getByText(/original is kept until publication succeeds/)).toBeTruthy();
  getJob.mockResolvedValue({ id: 'j1', status: 'queued', error: null });
  fireEvent.click(screen.getByRole('button', { name: 'Reprocess draft' }));
  await waitFor(() => expect(reprocess).toHaveBeenCalledWith('j1', 'brand'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Publish video' })).toBeNull());
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
  // Sized to its natural aspect ratio instead of a full-width letterboxed panel.
  expect(container.querySelector('video')!.style.aspectRatio).toBe('1280 / 720');
  expect(container.querySelector('video')!.style.maxWidth).toBe('683px');
  expect(container.querySelector('video')!.className).toContain('object-contain');
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
