// @vitest-environment node
import { expect, it } from 'vitest';
import { normalizeInstagramMedia, parseInstagramFeedResponse } from './instagramFeed';

const now = Date.now();
const post = (id: number, daysAgo: number, mediaType: string = 'IMAGE') => ({
  id: String(id),
  media_type: mediaType,
  media_url: `https://scontent.cdninstagram.com/${id}.jpg`,
  thumbnail_url: `https://scontent.cdninstagram.com/${id}-thumb.jpg`,
  permalink: `https://www.instagram.com/p/post-${id}/`,
  timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  caption: `Post ${id}`,
});

it('keeps only the six newest posts in the rolling 30-day window', () => {
  const values = Array.from({ length: 9 }, (_, index) => post(index + 1, index + 1)).reverse();
  values.push(post(20, 31));
  const result = normalizeInstagramMedia(values, now);
  expect(result.map(item => item.id)).toEqual(['1', '2', '3', '4', '5', '6']);
});

it('uses a video thumbnail and drops unsupported or untrusted media URLs', () => {
  const video = normalizeInstagramMedia([post(1, 1, 'VIDEO')], now);
  expect(video[0].previewUrl).toContain('-thumb.jpg');
  expect(normalizeInstagramMedia([{
    ...post(2, 1), media_url: 'https://attacker.example/post.jpg',
  }], now)).toEqual([]);
});

it('rejects malformed feed responses and removes cached posts that have aged out', () => {
  expect(() => parseInstagramFeedResponse({ username: 'luvia', posts: [{}], fetchedAt: new Date(now).toISOString(), stale: false }, now))
    .toThrow('invalid feed post');
  const result = parseInstagramFeedResponse({
    username: 'luvia',
    posts: [{
      id: '1', permalink: 'https://www.instagram.com/p/a/', previewUrl: 'https://scontent.cdninstagram.com/a.jpg',
      caption: '', mediaType: 'IMAGE', timestamp: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    }],
    fetchedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(), stale: true,
  }, now);
  expect(result.posts).toEqual([]);
});
