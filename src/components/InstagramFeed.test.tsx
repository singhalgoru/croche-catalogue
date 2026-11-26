import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { products } from '../data/products';
import InstagramFeed from './InstagramFeed';

const mocks = vi.hoisted(() => ({ fetchInstagramFeed: vi.fn() }));
vi.mock('../services/instagramFeed', () => ({ fetchInstagramFeed: mocks.fetchInstagramFeed }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  mocks.fetchInstagramFeed.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

const post = {
  id: '123', permalink: 'https://www.instagram.com/reel/abc/',
  previewUrl: 'https://scontent.cdninstagram.com/post.jpg', caption: 'Making a tiny crochet flower',
  mediaType: 'VIDEO' as const, timestamp: new Date().toISOString(),
};

it('shows recent video previews linked to Instagram and the connected account', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed />);
  const videoLink = await screen.findByRole('link', { name: /View video from @luvia on Instagram/ });
  expect(videoLink.getAttribute('href')).toBe(post.permalink);
  expect(videoLink.querySelector('img')?.getAttribute('alt')).toContain('@luvia');
  expect(videoLink.querySelector('svg')).toBeTruthy();
  expect(videoLink.className).toContain('aspect-[4/5]');
  expect(videoLink.querySelector('img')?.className).toContain('object-cover');
  const followLink = screen.getByRole('link', { name: 'Follow Luvia' });
  expect(followLink.getAttribute('href')).toBe('https://www.instagram.com/luvia/');
  expect(followLink.className).toContain('bg-cocoa');
  expect(screen.getByText('@luvia')).toBeTruthy();
  const carouselTrack = screen.getByRole('group', { name: 'From Instagram' });
  expect(carouselTrack.className).toContain('overflow-x-auto');
  expect(carouselTrack.className).not.toContain('snap-x');
  expect(screen.getByRole('button', { name: 'Next Instagram posts' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pause Instagram post rotation' })).toBeTruthy();
  expect(videoLink.parentElement?.className).toContain('w-[47%]');
  expect(screen.getByText('View post').parentElement?.className).toContain('group-hover:opacity-100');
  await waitFor(() => expect(screen.queryByText('Loading recent Instagram posts…')).toBeNull());
});

it('uses unobtrusive icons for video and carousel posts without text badges', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia',
    posts: [
      post,
      { ...post, id: '456', mediaType: 'CAROUSEL_ALBUM' as const },
      { ...post, id: '789', mediaType: 'IMAGE' as const },
    ],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  render(<InstagramFeed />);
  const photoLink = await screen.findByRole('link', { name: /View photo from @luvia on Instagram/ });
  const postLinks = screen.getAllByRole('link', { name: /View .* from @luvia on Instagram/ });
  expect(postLinks).toHaveLength(3);
  expect(postLinks.every(link => link.className.includes('aspect-[4/5]'))).toBe(true);
  expect(postLinks[0].querySelectorAll('svg')).toHaveLength(2);
  expect(postLinks[1].querySelectorAll('svg')).toHaveLength(2);
  expect(photoLink.querySelectorAll('svg')).toHaveLength(1);
  expect(screen.queryByText('Carousel')).toBeNull();
  expect(screen.queryByText('Video')).toBeNull();
});

it('cleans captions and links matching in-stock products with catalogue prices', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luviacreations',
    posts: [{ ...post, caption: '🧿 Evil Eye Charm (Bag / Key / Car) ✨ #crochet' }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  render(<InstagramFeed products={products} />);
  const postLink = await screen.findByRole('link', { name: /View video from @luviacreations/ });
  expect(screen.getByText('Evil Eye Charm (Bag / Key / Car)')).toBeTruthy();
  expect(screen.queryByText(/🧿|✨|#crochet/)).toBeNull();
  const shopLink = screen.getByRole('link', { name: 'Shop this ₹249 →' });
  expect(shopLink.getAttribute('href')).toContain('/p/evil-eye-charm-bag-key-car/');
  expect(postLink.querySelector('img')?.className).toContain('brightness-75');
});

it('labels stale cached posts clearly', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: true,
  });
  render(<InstagramFeed />);
  expect((await screen.findByText(/Showing saved posts/)).textContent).toContain('Showing saved posts');
});
