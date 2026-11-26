import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InstagramFeed from './InstagramFeed';

const mocks = vi.hoisted(() => ({ fetchInstagramFeed: vi.fn() }));
vi.mock('../services/instagramFeed', () => ({ fetchInstagramFeed: mocks.fetchInstagramFeed }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => mocks.fetchInstagramFeed.mockReset());

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
  expect(screen.getByRole('link', { name: 'Follow Luvia' }).getAttribute('href')).toBe('https://www.instagram.com/luvia/');
  await waitFor(() => expect(screen.queryByText('Loading recent Instagram posts…')).toBeNull());
});

it('labels stale cached posts clearly', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: true,
  });
  render(<InstagramFeed />);
  expect((await screen.findByText(/Showing saved posts/)).textContent).toContain('Showing saved posts');
});
