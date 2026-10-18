import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import ProductMakingVideo from './ProductMakingVideo';

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
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('renders nothing for products without a video', () => {
  const { container } = render(<ProductMakingVideo product={{ ...product, makingVideo: undefined }} />);
  expect(container.innerHTML).toBe('');
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
