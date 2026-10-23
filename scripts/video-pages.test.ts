import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { fetchVideoUploadDate, renderVideoPage, videoSchema } from './video-pages.mjs';
import { renderProductPage, renderSitemap, toProduct } from './prerender.mjs';

const product = {
  ...toProduct({ id: 'p1', name: 'Rose & ribbon', public_slug: 'rose', category: 'Decor',
    description: 'Handmade rose.', price: 200, published_at: '2026-10-01', product_variants: [] }),
  makingVideo: {
    title: 'Making a rose <by hand>', videoUrl: 'https://videos.luviacreations.com/making-videos/job/video.mp4',
    posterUrl: 'https://videos.luviacreations.com/making-videos/job/poster.webp',
    durationSeconds: 20.25, width: 404, height: 720, uploadDate: '2026-10-22T17:26:25.000Z',
  },
};
afterEach(() => vi.unstubAllGlobals());

it('renders a self-canonical watch page with a prominent native player and matching metadata without JavaScript', () => {
  const doc = new JSDOM(renderVideoPage(product)).window.document;
  expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://luviacreations.com/watch/rose/');
  expect(doc.querySelector('h1')?.textContent).toBe(product.makingVideo.title);
  const video = doc.querySelector('main video')!;
  expect(video.getAttribute('src')).toBe(product.makingVideo.videoUrl);
  expect(video.getAttribute('preload')).toBe('none');
  expect(video.hasAttribute('autoplay')).toBe(false);
  expect(doc.querySelector('script[type="module"]')).toBeNull();
  expect(doc.querySelector('a[href="/p/rose/"]')).not.toBeNull();
  const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(schema.mainEntity).toEqual(videoSchema(product));
  expect(schema.mainEntity.uploadDate).toBe('2026-10-22T17:26:25.000Z');
  expect(schema.mainEntity.duration).toBe('PT20.25S');
  const detail = new JSDOM(renderProductPage(product)).window.document;
  expect(detail.querySelector('video[preload="none"]')).not.toBeNull();
  expect(detail.querySelector('a[href="/watch/rose/"]')).not.toBeNull();
});

it('includes only published product videos in valid namespaced sitemap XML', () => {
  const xml = renderSitemap([product, { ...product, id: 'p2', publicSlug: 'no-video', makingVideo: undefined }], '2026-10-23');
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  const videos = doc.getElementsByTagNameNS('http://www.google.com/schemas/sitemap-video/1.1', 'video');
  expect(videos).toHaveLength(1);
  expect(videos[0].parentElement?.querySelector('loc')?.textContent).toBe('https://luviacreations.com/watch/rose/');
  expect(videos[0].getElementsByTagName('video:title')[0].textContent).toBe(product.makingVideo.title);
  expect(videos[0].getElementsByTagName('video:content_loc')[0].textContent).toBe(product.makingVideo.videoUrl);
  expect(videos[0].getElementsByTagName('video:duration')[0].textContent).toBe('21');
});

it('uses the actual media upload timestamp rather than the build or product date', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, {
    headers: { 'Last-Modified': 'Thu, 22 Oct 2026 17:26:25 GMT' },
  }));
  vi.stubGlobal('fetch', fetcher);
  expect(await fetchVideoUploadDate(product)).toBe(product.makingVideo.uploadDate);
  expect(fetcher).toHaveBeenCalledWith(product.makingVideo.videoUrl, expect.objectContaining({ method: 'HEAD' }));
});

it('does not invent an upload date when storage metadata is missing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
  await expect(fetchVideoUploadDate(product)).rejects.toThrow('Unable to read published video upload date');
});
