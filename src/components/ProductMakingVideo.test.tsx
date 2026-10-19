import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import ProductMakingVideo, { WatchMakingVideoLink } from './ProductMakingVideo';

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('../services/analytics', () => ({ trackEvent }));
const product: Product = {
  id: 'p1', name: 'Rose', category: 'Flowers', price: 200, description: 'Rose',
  color: 'red', inStock: true, image: '/photo.webp', variants: [],
  makingVideo: { videoUrl: 'https://images.luviacreations.com/making-videos/id/video.mp4',
    posterUrl: 'https://images.luviacreations.com/making-videos/id/poster.webp',
    durationSeconds: 20, width: 1280, height: 720 },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('renders nothing for products without a video', () => {
  const { container } = render(<ProductMakingVideo product={{ ...product, makingVideo: undefined }} />);
  expect(container.innerHTML).toBe('');
});

it.each([[404, 720], [1280, 720]])('preserves the full %i x %i frame in both the poster and player', (width, height) => {
  const { container } = render(<ProductMakingVideo product={{
    ...product, makingVideo: { ...product.makingVideo!, width, height },
  }} />);
  const poster = container.querySelector('img')!;
  expect(poster.style.aspectRatio).toBe(`${width} / ${height}`);
  expect(poster.className).toContain('object-contain');
  expect(poster.className).not.toContain('object-cover');
  fireEvent.click(screen.getByRole('button', { name: 'Play making video for Rose' }));
  const video = container.querySelector('video')!;
  expect(video.style.aspectRatio).toBe(`${width} / ${height}`);
  expect(video.className).toBe(poster.className);
});

it('does not create any media source or request playback until the shopper taps', () => {
  const { container } = render(<ProductMakingVideo product={product} />);
  expect(container.querySelector('video,source')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(container.querySelector('img')?.getAttribute('src')).toBe(product.makingVideo!.posterUrl);
  fireEvent.click(screen.getByRole('button', { name: 'Play making video for Rose' }));
  const video = container.querySelector('video')!;
  expect(video.getAttribute('src')).toBe(product.makingVideo!.videoUrl);
  expect(video.preload).toBe('none');
  expect(video.autoplay).toBe(false);
  expect(video.controls).toBe(true);
  expect(video.playsInline).toBe(true);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.play(video);
  fireEvent.ended(video);
  expect(trackEvent.mock.calls).toEqual([
    ['making_video_request', { product_id: 'p1' }],
    ['making_video_play', { product_id: 'p1' }],
    ['making_video_complete', { product_id: 'p1' }],
  ]);
});

it('shows an explicit error and retries without changing product photos', () => {
  const { container } = render(<ProductMakingVideo product={product} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play making video for Rose' }));
  fireEvent.error(container.querySelector('video')!);
  expect(screen.getByRole('alert').textContent).toContain('could not be played');
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
  expect(container.querySelector('video')).toBeNull();
  expect(screen.getByRole('button', { name: 'Play making video for Rose' })).toBeTruthy();
  expect(product.image).toBe('/photo.webp');
});

it('shares a clean product link anchored to the making video without fetching or playing it', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share });
  const { container } = render(<ProductMakingVideo product={product} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share making video' }));
  await waitFor(() => expect(share).toHaveBeenCalledWith({
    title: 'Rose | Luvia Creations',
    text: 'Watch how Rose is made by Luvia Creations.',
    url: `${window.location.origin}/p/rose/?watch=making-video#making-video`,
  }));
  expect(container.querySelector('video')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it('copies the anchored link when native sharing is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<ProductMakingVideo product={product} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share making video' }));
  await screen.findByText('Making video link copied.');
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/rose/?watch=making-video#making-video`);
});

it('shows a selectable link when neither native sharing nor clipboard is available', async () => {
  vi.stubGlobal('navigator', {});
  render(<ProductMakingVideo product={product} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share making video' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Sharing is unavailable');
  expect(screen.getByLabelText<HTMLInputElement>('Making video share link').value).toContain('#making-video');
});

it('handles cancellation quietly and exposes a manual link on actual sharing failure', async () => {
  const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
  vi.stubGlobal('navigator', { share });
  render(<ProductMakingVideo product={product} />);
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Share making video' });
  fireEvent.click(button);
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(screen.queryByRole('alert')).toBeNull();
  share.mockRejectedValue(new Error('Permission denied'));
  fireEvent.click(button);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to share');
  expect(screen.getByLabelText<HTMLInputElement>('Making video share link').value).toBe(`${window.location.origin}/p/rose/?watch=making-video#making-video`);
});

it.each(['/p/rose/#making-video', '/p/rose/?watch=making-video'])('opens %s at the video and starts muted playback', async (url) => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.history.replaceState(null, '', url);
  const { container } = render(<ProductMakingVideo product={product} />);
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  expect(container.querySelector('video')?.muted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
  expect(container.querySelector('video')?.muted).toBe(false);
  expect(screen.getByRole('button', { name: 'Share making video' }).textContent).toBe('');
});

it('offers a link near the top that scrolls to the video and starts it', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const { container } = render(<><WatchMakingVideoLink product={product} /><ProductMakingVideo product={product} /></>);
  fireEvent.click(screen.getByRole('link', { name: /Watch how it.s made/ }));
  expect(scroll).toHaveBeenCalled();
  expect(container.querySelector('video')).not.toBeNull();
  cleanup();
  expect(render(<WatchMakingVideoLink product={{ ...product, makingVideo: undefined }} />).container.innerHTML).toBe('');
});
