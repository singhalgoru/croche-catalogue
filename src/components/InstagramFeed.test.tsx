import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { products } from '../data/products';
import InstagramFeed from './InstagramFeed';

const mocks = vi.hoisted(() => ({ fetchInstagramFeed: vi.fn(), readInstagramSnapshot: vi.fn(), trackEvent: vi.fn() }));
vi.mock('../services/instagramFeed', () => ({ fetchInstagramFeed: mocks.fetchInstagramFeed, readInstagramSnapshot: mocks.readInstagramSnapshot }));
vi.mock('../services/analytics', () => ({ trackEvent: mocks.trackEvent }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  mocks.fetchInstagramFeed.mockReset();
  mocks.readInstagramSnapshot.mockReset();
  mocks.readInstagramSnapshot.mockReturnValue(null);
  mocks.trackEvent.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class {
    private callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe(target: Element) {
      this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

const post = {
  id: '123', permalink: 'https://www.instagram.com/reel/abc/',
  previewUrl: 'https://scontent.cdninstagram.com/post.jpg', caption: 'Making a tiny crochet flower',
  mediaType: 'VIDEO' as const, timestamp: new Date().toISOString(),
};

it('keeps the saved gallery when the live feed fails and replaces it on a successful empty response', async () => {
  const saved = { username: 'luvia', posts: [{ ...post, previewUrl: '/instagram-snapshot/123.webp' }], fetchedAt: new Date().toISOString(), stale: true };
  mocks.readInstagramSnapshot.mockReturnValue(saved);
  mocks.fetchInstagramFeed.mockRejectedValueOnce(new Error('offline'));
  const { unmount } = render(<InstagramFeed presentation="gallery" />);
  expect(screen.getByRole('img').getAttribute('src')).toBe('/instagram-snapshot/123.webp');
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Showing saved posts'));
  unmount();
  mocks.fetchInstagramFeed.mockResolvedValueOnce({ ...saved, posts: [], stale: false });
  render(<InstagramFeed presentation="gallery" />);
  await screen.findByText(/No posts from the last 30 days/);
  expect(screen.queryByRole('img')).toBeNull();
});

it('uses saved thumbnails for matching live posts without resurrecting removed posts', async () => {
  const saved = { username: 'luvia', posts: [{ ...post, previewUrl: '/instagram-snapshot/123.webp' }], fetchedAt: new Date().toISOString(), stale: true };
  mocks.readInstagramSnapshot.mockReturnValue(saved);
  mocks.fetchInstagramFeed.mockResolvedValue({ ...saved, posts: [post, { ...post, id: '456' }], stale: false });
  render(<InstagramFeed presentation="gallery" />);
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  const images = screen.getAllByRole('img');
  expect(images[0].getAttribute('src')).toBe('/instagram-snapshot/123.webp');
  expect(images[1].getAttribute('src')).toBe(post.previewUrl);
});

it('shows matched products with a product thumbnail, Instagram and WhatsApp links in the gallery', async () => {
  const product = { ...products[0], id: 'match', name: 'Bunny Toy', publicSlug: 'bunny-toy', inStock: true };
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [{ ...post, productId: 'match', caption: '🧶 Handmade bunny #crochet' }],
    fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed products={[product]} presentation="gallery" />);
  const image = await screen.findByAltText('Handmade crochet Bunny Toy');
  expect(image.getAttribute('loading')).toBe('eager');
  expect(image.closest('a')?.getAttribute('href')).toContain('/p/bunny-toy/');
  expect(screen.getByText('Read more').closest('summary')?.textContent).toContain('Handmade bunny');
  expect(screen.getByRole('link', { name: 'View on Instagram' }).getAttribute('href')).toBe(post.permalink);
  expect(screen.getByRole('link', { name: 'Ask on WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\//);
});

it('offers the complete original caption from an expandable gallery preview', async () => {
  const caption = `🧶 ${'Handmade crochet flowers for thoughtful gifts. '.repeat(3)}#crochet`;
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [{ ...post, caption }], fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed presentation="gallery" />);
  const summary = await screen.findByText(/Read more/);
  const details = summary.closest('details')!;
  expect(details.querySelector('p')?.textContent).toBe(caption);
  expect(details.hasAttribute('open')).toBe(false);
  fireEvent.click(summary);
  expect(details.hasAttribute('open')).toBe(true);
});

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
  expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe('/from-instagram/');
  expect(followLink.className).toContain('bg-cocoa');
  expect(screen.getByText('@luvia')).toBeTruthy();
  const heading = screen.getByRole('heading', { name: 'From Instagram' });
  expect(heading.querySelector('svg')?.parentElement?.className).toContain('#feda75');
  const carouselTrack = screen.getByRole('group', { name: 'From Instagram' });
  expect(carouselTrack.className).toContain('overflow-x-auto');
  expect(carouselTrack.className).not.toContain('snap-x');
  expect(screen.getByRole('button', { name: 'Next Instagram posts' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pause Instagram post rotation' })).toBeTruthy();
  expect(videoLink.parentElement?.className).toContain('w-[82%]');
  expect(screen.getByText('View post').parentElement?.className).toContain('group-hover:opacity-100');
  await waitFor(() => expect(screen.queryByText('Loading recent Instagram posts…')).toBeNull());
});

it('overlays likes and views on the image with high-contrast icons and counts', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia',
    posts: [{ ...post, likesCount: 12345, viewsCount: 67890 }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  render(<InstagramFeed />);
  const postLink = await screen.findByRole('link', { name: /View video from @luvia on Instagram.*12,345 likes.*67,890 views/ });
  const engagementOverlay = postLink.querySelector('[class*="bg-black/70"]');
  expect(engagementOverlay?.className).toContain('bg-black/70');
  expect(engagementOverlay?.textContent).toContain('12.3K');
  expect(engagementOverlay?.textContent).toContain('67.9K');
  expect(engagementOverlay?.querySelector('svg')?.getAttribute('class')).toContain('text-rose-400');
  expect(engagementOverlay?.querySelectorAll('svg')[1]?.getAttribute('class')).toContain('text-amber-100');
});

it('tracks feed visibility, post clicks, Follow clicks and Shop clicks', async () => {
  const product = { ...products[0], id: 'instagram-product', name: 'Bunny Toy', price: 2100 };
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia',
    posts: [{ ...post, id: 'instagram-post', productId: product.id, likesCount: 12, viewsCount: 34 }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  render(<InstagramFeed products={[product]} />);
  const postLink = await screen.findByRole('link', { name: /View video from @luvia on Instagram/ });
  const shopLink = screen.getByRole('link', { name: 'Shop this ₹2100 →' });
  const followLink = screen.getByRole('link', { name: 'Follow Luvia' });
  await waitFor(() => expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_feed_view', {
    post_count: 1, instagram_username: 'luvia', stale: false, location: 'homepage',
  }));
  fireEvent.click(postLink);
  fireEvent.click(shopLink);
  fireEvent.click(followLink);
  expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_post_click', {
    instagram_media_id: 'instagram-post', media_type: 'VIDEO', has_shop_link: true, like_count: 12, view_count: 34,
  });
  expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_shop_click', expect.objectContaining({
    instagram_media_id: 'instagram-post', item_id: 'instagram-product', item_name: 'Bunny Toy',
    item_category: product.category, currency: 'INR', value: 2100,
  }));
  expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_follow_click', {
    instagram_username: 'luvia', location: 'homepage_instagram_feed',
  });
});

it('shares the selected Instagram post through the native share sheet', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed />);
  fireEvent.click(await screen.findByRole('button', { name: 'Share this Instagram post' }));
  await waitFor(() => expect(share).toHaveBeenCalledWith({
    title: 'luvia on Instagram',
    text: 'See this post from @luvia on Instagram.',
    url: post.permalink,
  }));
  expect((await screen.findByRole('status')).textContent).toBe('Instagram post shared.');
  expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_post_share', {
    instagram_media_id: post.id, method: 'native',
  });
});

it('copies the selected Instagram permalink when native sharing is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed />);
  fireEvent.click(await screen.findByRole('button', { name: 'Share this Instagram post' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(post.permalink));
  expect((await screen.findByRole('status')).textContent).toBe('Instagram post link copied.');
  expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_post_share', {
    instagram_media_id: post.id, method: 'copy_link',
  });
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

it('cleans captions and uses curated Instagram IDs for product links and catalogue prices', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luviacreations',
    posts: [{ ...post, id: '17953955715341054', caption: '🧿 Evil Eye Charm (Bag / Key / Car) ✨ #crochet' }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  const productsWithRenamedSlug = products.map(product => product.id === 'p32'
    ? { ...product, id: '63448c7a-00cc-4b13-9f81-29d04190d028', publicSlug: 'evil-eye-charm-renamed' }
    : product);
  render(<InstagramFeed products={productsWithRenamedSlug} />);
  const postLink = await screen.findByRole('link', { name: /View video from @luviacreations/ });
  expect(screen.getByText('Evil Eye Charm (Bag / Key / Car)')).toBeTruthy();
  expect(screen.queryByText(/🧿|✨|#crochet/)).toBeNull();
  const shopLink = screen.getByRole('link', { name: 'Shop this ₹249 →' });
  expect(shopLink.getAttribute('href')).toContain('/p/evil-eye-charm-renamed/');
  expect(postLink.querySelector('img')?.className).toContain('brightness-75');
});

it('links bunny posts to their matching in-stock catalogue products', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luviacreations',
    posts: [
      { ...post, id: '18071831963616204', caption: 'Our crochet bunnies are ready for their forever home' },
      { ...post, id: '18444362995183919', caption: 'Meet our Cute Bunny!' },
    ],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  const bunnyProducts = [
    { ...products[0], id: '8ce989f9-95a8-4d23-945d-a49bed84c0b2', name: 'Bunny Toy', publicSlug: 'bunny-toy', price: 2100 },
    { ...products[0], id: '88d58adb-3573-4c6c-ba3c-791a151c0726', name: 'Cute Bunny', publicSlug: 'cute-bunny', price: 1100 },
  ];
  render(<InstagramFeed products={bunnyProducts} />);
  const shopLinks = await screen.findAllByRole('link', { name: /Shop this/ });
  expect(shopLinks.map(link => link.textContent)).toEqual(['Shop this ₹2100 →', 'Shop this ₹1100 →']);
  expect(shopLinks[0].getAttribute('href')).toContain('/p/bunny-toy/');
  expect(shopLinks[1].getAttribute('href')).toContain('/p/cute-bunny/');
});

it('does not infer a product link from a caption without a curated post ID', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luviacreations',
    posts: [{ ...post, caption: 'Evil Eye Charm (Bag / Key / Car)' }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  });
  render(<InstagramFeed products={products} />);
  await screen.findByRole('link', { name: /View video from @luviacreations/ });
  expect(screen.queryByRole('link', { name: /Shop this/ })).toBeNull();
});

it('labels stale cached posts clearly', async () => {
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts: [post], fetchedAt: new Date().toISOString(), stale: true,
  });
  render(<InstagramFeed />);
  expect((await screen.findByText(/Showing saved posts/)).textContent).toContain('Showing saved posts');
});

it('shows all recent posts in the gallery and tracks its visibility', async () => {
  const posts = Array.from({ length: 8 }, (_, index) => ({ ...post, id: String(index + 1) }));
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts, fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed presentation="gallery" />);
  const gallery = await screen.findByRole('group', { name: 'Recent Instagram posts' });
  expect(gallery.querySelectorAll('a[href*="instagram.com/reel/"]')).toHaveLength(8);
  expect(gallery.className).toContain('grid-cols-2');
  expect(screen.getAllByRole('link', { name: 'Follow Luvia' })).toHaveLength(2);
  await waitFor(() => expect(mocks.trackEvent).toHaveBeenCalledWith('instagram_feed_view', {
    post_count: 8, instagram_username: 'luvia', stale: false, location: 'instagram_page',
  }));
});

it('keeps the homepage carousel to six posts when the feed has more', async () => {
  const posts = Array.from({ length: 8 }, (_, index) => ({ ...post, id: String(index + 1) }));
  mocks.fetchInstagramFeed.mockResolvedValue({
    username: 'luvia', posts, fetchedAt: new Date().toISOString(), stale: false,
  });
  render(<InstagramFeed />);
  const carouselTrack = await screen.findByRole('group', { name: 'From Instagram' });
  const postLinks = [...carouselTrack.querySelectorAll('a[href*="instagram.com/reel/"]')];
  expect(postLinks.filter(link => !link.closest('[aria-hidden="true"]'))).toHaveLength(6);
});
