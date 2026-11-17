import { expect, it } from 'vitest';
import { parseSocialPost, socialPostImageUrls, type SocialPost } from './socialPosts';

const fixture = (): SocialPost => ({
  id: '00000000-0000-4000-8000-000000000001', product_id: '00000000-0000-4000-8000-000000000002',
  platform: 'facebook', status: 'draft', request: {
    productName: 'Bag', productUrl: 'https://example.test/p/bag/', sourceImageUrl: 'https://images.example.test/source.webp',
    imageUrl: 'https://images.example.test/prepared.jpg', caption: 'Handmade bag', pageId: '456', pageName: 'Page',
  },
  container_id: null, post_id: null, permalink: null, error: null, attempt_started_at: null, publish_started_at: null,
  revision: 1, updated_at: '2026-01-01T00:00:00Z',
});

it('preserves legacy singleton snapshots and ordered paired lists with partial child checkpoints', () => {
  const legacy = fixture();
  expect(parseSocialPost(legacy)).toEqual(legacy);
  expect(socialPostImageUrls(parseSocialPost(legacy).request)).toEqual([legacy.request.imageUrl]);
  const value = fixture();
  value.request.sourceImageUrls = [value.request.sourceImageUrl, 'https://images.example.test/second.webp'];
  value.request.imageUrls = [value.request.imageUrl, 'https://images.example.test/second.jpg'];
  value.request.childMediaIds = ['101'];
  expect(parseSocialPost(value)).toEqual(value);
  expect(socialPostImageUrls(parseSocialPost(value).request)).toEqual(value.request.imageUrls);
});

it('parses saved making-video media and allows a Facebook video to remain processing after upload', () => {
  const video: SocialPost = {
    ...fixture(), status: 'processing', post_id: '500', attempt_started_at: '2026-01-01T00:00:00Z',
    publish_started_at: '2026-01-01T00:00:00Z',
    request: { ...fixture().request, mediaType: 'video', videoUrl: 'https://videos.example.test/making-videos/job/video.mp4' },
  };
  expect(parseSocialPost(video)).toEqual(video);
  const invalid = structuredClone(video);
  invalid.request.videoUrl = 'http://videos.example.test/video.mp4';
  expect(() => parseSocialPost(invalid)).toThrow('Invalid saved social post media');
  const photo = { ...fixture(), status: 'processing' as const, post_id: '500' };
  expect(() => parseSocialPost(photo)).toThrow('Invalid saved social post details');
});

it('rejects malformed, unpaired, mismatched and over-limit saved image lists or invalid child checkpoints', () => {
  const source = fixture().request.sourceImageUrl;
  const image = fixture().request.imageUrl;
  for (const fields of [
    { sourceImageUrls: [source] }, { imageUrls: [image] },
    { sourceImageUrls: [], imageUrls: [] },
    { sourceImageUrls: [source, source], imageUrls: [image, image] },
    { sourceImageUrls: [source], imageUrls: [image, 'https://images.example.test/2.jpg'] },
    { sourceImageUrls: ['https://images.example.test/other.webp'], imageUrls: [image] },
    { sourceImageUrls: [source], imageUrls: ['https://images.example.test/other.jpg'] },
    { sourceImageUrls: [source, 'http://example.test/source'], imageUrls: [image, 'https://example.test/2.jpg'] },
    { sourceImageUrls: Array.from({ length: 11 }, (_, i) => `https://example.test/${i}`), imageUrls: [image] },
    { childMediaIds: [] }, { childMediaIds: ['invalid'] }, { childMediaIds: ['101', '102'] },
  ]) {
    const value = fixture();
    Object.assign(value.request, fields);
    expect(() => parseSocialPost(value)).toThrow('Invalid saved social post images');
  }
});
