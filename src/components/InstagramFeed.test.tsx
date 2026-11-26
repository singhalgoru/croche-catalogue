import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  expect(screen.getByText('Video')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Follow Luvia' }).getAttribute('href')).toBe('https://www.instagram.com/luvia/');
  expect(screen.getByRole('group', { name: 'From Instagram' }).getAttribute('class')).toContain('overflow-x-auto');
  expect(screen.getByRole('button', { name: 'Next Instagram posts' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('Loading recent Instagram posts…')).toBeNull());
});

it('badges only videos and photo carousels', async () => {
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
  await screen.findByRole('link', { name: /View photo from @luvia on Instagram/ });
  expect(screen.getByText('Video')).toBeTruthy();
  expect(screen.getByText('Carousel')).toBeTruthy();
  expect(screen.queryByText('Photo')).toBeNull();
});

it('labels stale cached posts clearly', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: true,
  });
  render(<InstagramFeed />);
  expect((await screen.findByText(/Showing saved posts/)).textContent).toContain('Showing saved posts');
});
