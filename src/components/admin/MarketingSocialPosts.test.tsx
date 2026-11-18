import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MarketingSocialPosts from './MarketingSocialPosts';
import { mockNativeDialog } from './dialogTestSupport';
import type { ManagedProduct } from '../../services/products';
import type { SocialPlatform, SocialPost } from '../../services/socialPosts';

const mocks = vi.hoisted(() => ({
  products: vi.fn(), list: vi.fn(), setup: vi.fn(), prepare: vi.fn(), publish: vi.fn(), refresh: vi.fn(), jpeg: vi.fn(),
}));
vi.mock('../../services/products', () => ({ fetchManagedProducts: mocks.products }));
vi.mock('../../utils/imageUploadConversion', () => ({ prepareSocialPostJpeg: mocks.jpeg }));
vi.mock('../../services/socialPosts', () => ({
  listProductSocialPosts: mocks.list, checkSocialPublishing: mocks.setup, prepareProductSocialPosts: mocks.prepare,
  publishProductSocialPosts: mocks.publish, refreshProductSocialPosts: mocks.refresh,
  socialCaptionLimits: { facebook: 5000, instagram: 2200 },
}));
const product: ManagedProduct = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Crochet bag', publicSlug: 'crochet-bag',
  category: 'Bags', description: 'Handmade bag', price: 500, color: 'Pink', inStock: true, variants: [],
  image: 'https://images.example.test/bag.webp', imagePath: 'products/bag.webp', published: true,
  publishedAt: null, createdAt: '2026-01-01T00:00:00Z',
};
const post = (platform: SocialPlatform, status: SocialPost['status'] = 'draft'): SocialPost => ({
  id: `00000000-0000-4000-8000-${platform === 'facebook' ? '000000000002' : '000000000003'}`,
  product_id: product.id, platform, status, revision: 3,
  request: {
    productName: product.name, productUrl: 'https://luviacreations.com/p/crochet-bag/', sourceImageUrl: product.image,
    imageUrl: `https://images.example.test/${platform}.jpg`, caption: `Reviewed ${platform} caption`, pageId: '456', pageName: 'Luvia Page',
    ...(platform === 'instagram' ? { instagramUserId: '999', instagramUsername: 'luvia' } : {}),
  },
  container_id: status === 'ready' ? '300' : null, post_id: null, permalink: null, error: null,
  attempt_started_at: status === 'ready' ? '2026-01-01T00:00:00Z' : null, publish_started_at: null, updated_at: '2026-01-01T00:00:00Z',
});
const makingVideo = {
  title: 'Making the bag', videoUrl: 'https://videos.example.test/making-videos/job/video.mp4',
  posterUrl: 'https://images.example.test/making-videos/job/poster.webp',
  durationSeconds: 20, width: 1280, height: 720,
};
const videoPost = (platform: SocialPlatform): SocialPost => ({
  ...post(platform),
  request: { ...post(platform).request, mediaType: 'video', videoUrl: makingVideo.videoUrl, imageUrl: makingVideo.posterUrl },
});
let restore: () => void;
beforeEach(() => {
  vi.resetAllMocks();
  restore = mockNativeDialog();
  mocks.products.mockResolvedValue([product, { ...product, id: 'unpublished', name: 'Hidden product', published: false }]);
  mocks.list.mockResolvedValue([]);
  mocks.setup.mockResolvedValue({ enabled: true, pageId: '456', pageName: 'Luvia Page', instagram: { id: '999', username: 'luvia' } });
  mocks.jpeg.mockResolvedValue(new File(['jpeg'], 'social-post.jpg', { type: 'image/jpeg' }));
  mocks.prepare.mockResolvedValue([post('facebook'), post('instagram')]);
  mocks.refresh.mockResolvedValue([post('instagram', 'ready')]);
  mocks.publish.mockResolvedValue([post('facebook', 'publishing'), post('instagram', 'processing')]);
});
afterEach(() => { cleanup(); restore(); });
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Create social post' }));
  await screen.findByRole('option', { name: product.name });
};
const check = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Check publishing access (read-only)' }));
  await screen.findByText('Luvia Page', { selector: 'strong' });
};
const confirmation = () => screen.getByRole('checkbox', { name: /I reviewed the saved images/ });

it('opens an accessible modal on demand without fetching while closed or posting on product selection', async () => {
  render(<MarketingSocialPosts />);
  expect(mocks.products).not.toHaveBeenCalled();
  await open();
  expect(screen.getByRole('dialog', { name: 'Product social post' })).toHaveProperty('open', true);
  expect(screen.queryByRole('option', { name: 'Hidden product' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Published product' }), { target: { value: product.id } });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(product.id));
  expect(screen.getByRole('textbox', { name: /Facebook Page caption/ })).toHaveProperty('value', expect.stringContaining('/p/crochet-bag/'));
  expect(screen.getByRole('textbox', { name: /Instagram caption/ })).toHaveProperty('value', expect.stringContaining('link in our bio'));
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('starts captions with plain product copy and inserts emojis at the cursor', async () => {
  const formattedProduct = { ...product, description: '**Handmade** crochet bag.' };
  render(<MarketingSocialPosts initialProduct={formattedProduct} />);
  await open();
  const caption = screen.getByRole('textbox', { name: /Facebook Page caption/ }) as HTMLTextAreaElement;
  expect(caption.value).toContain('Handmade crochet bag.');
  expect(caption.value).not.toContain('**');
  caption.setSelectionRange(0, 0);
  fireEvent.click(screen.getByText('Add emoji to Facebook Page caption'));
  fireEvent.click(screen.getAllByRole('button', { name: 'Insert Red heart' })[0]);
  expect(caption.value.startsWith('❤️')).toBe(true);
});

it('prepares JPEG review first, requires loaded previews and explicit live confirmation, and sends exact saved revisions', async () => {
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('disabled', false));
  await check();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare post previews (does not publish)' }));
  await screen.findByText('Reviewed facebook caption', { selector: 'p' });
  expect(mocks.jpeg).toHaveBeenCalledWith(product.image);
  expect(confirmation()).toHaveProperty('disabled', true);
  fireEvent.load(screen.getByAltText('Saved Facebook Page post preview'));
  fireEvent.load(screen.getByAltText('Saved Instagram post preview'));
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Confirm and publish LIVE' })).toHaveProperty('disabled', true);
  fireEvent.click(confirmation());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish LIVE' }));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(product.id, [
    { id: post('facebook').id, revision: 3 }, { id: post('instagram').id, revision: 3 },
  ]));
});

it('prepares a published making video for both platforms and requires video previews before live confirmation', async () => {
  const productWithVideo = { ...product, makingVideo };
  mocks.products.mockResolvedValue([productWithVideo]);
  mocks.prepare.mockResolvedValueOnce([videoPost('facebook'), videoPost('instagram')]);
  render(<MarketingSocialPosts initialProduct={productWithVideo} />);
  await open();
  fireEvent.click(screen.getByRole('radio', { name: /Making video/ }));
  expect(screen.getByLabelText('Crochet bag making video')).toBeTruthy();
  await check();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare post previews (does not publish)' }));
  await screen.findByText(/Video post previews saved\. Nothing has been published\./);
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    mediaType: 'video', videoUrl: makingVideo.videoUrl, sourceImageUrl: product.image,
  }));
  expect(mocks.jpeg).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Confirm and publish LIVE' })).toHaveProperty('disabled', true);
  fireEvent.loadedData(screen.getByLabelText('Saved Facebook Page video preview'));
  fireEvent.loadedData(screen.getByLabelText('Saved Instagram video preview'));
  fireEvent.click(confirmation());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish LIVE' }));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(product.id, [
    { id: videoPost('facebook').id, revision: 3 }, { id: videoPost('instagram').id, revision: 3 },
  ]));
});

it('creates a mixed Instagram replacement for an already published post and reviews every saved media item', async () => {
  const withVideo = { ...product, makingVideo };
  mocks.products.mockResolvedValue([withVideo]);
  const original: SocialPost = {
    ...post('instagram', 'published'), post_id: '600', permalink: 'https://www.instagram.com/p/original/',
    attempt_started_at: '2026-01-01T00:00:00Z', publish_started_at: '2026-01-01T00:00:00Z',
  };
  const mixed: SocialPost = {
    ...post('instagram'), id: '00000000-0000-4000-8000-000000000004',
    request: {
      ...post('instagram').request, mediaType: 'mixed', sourceImageUrls: [product.image],
      imageUrls: [post('instagram').request.imageUrl], videoUrl: makingVideo.videoUrl, videoPosterUrl: makingVideo.posterUrl,
      replacesPostId: original.id,
    },
  };
  mocks.list.mockResolvedValue([original]);
  mocks.prepare.mockResolvedValue([original, mixed]);
  mocks.publish.mockResolvedValue([original, { ...mixed, status: 'published', post_id: '700', permalink: 'https://www.instagram.com/p/replacement/' }]);
  render(<MarketingSocialPosts initialProduct={withVideo} />);
  await open();
  await screen.findByText('Instagram: Published');
  fireEvent.click(screen.getByRole('button', { name: 'Replace this Instagram post' }));
  expect(screen.getByRole('textbox', { name: 'Instagram caption' })).toHaveProperty('readOnly', false);
  fireEvent.click(screen.getByRole('radio', { name: 'Photos + making video (one Instagram carousel)' }));
  expect(screen.getByRole('checkbox', { name: 'Facebook Page' })).toHaveProperty('checked', false);
  expect(screen.getByRole('checkbox', { name: 'Facebook Page' })).toHaveProperty('disabled', true);
  await check();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare post previews (does not publish)' }));
  await screen.findByText(/One Instagram carousel: 1 photo/);
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    mediaType: 'mixed', videoUrl: makingVideo.videoUrl, sourceImageUrls: [product.image],
    replacesPostIds: { instagram: original.id }, captions: { instagram: original.request.caption },
  }), [expect.any(File)]);
  expect(confirmation()).toHaveProperty('disabled', true);
  // The original preview loading cannot satisfy the new video's review requirement.
  fireEvent.load(screen.getAllByAltText('Saved Instagram post preview')[0]);
  fireEvent.load(screen.getAllByAltText('Saved Instagram post preview')[1]);
  expect(confirmation()).toHaveProperty('disabled', true);
  fireEvent.loadedData(screen.getByLabelText('Saved Instagram video preview'));
  expect(confirmation()).toHaveProperty('disabled', false);
  fireEvent.click(confirmation());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish LIVE' }));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(product.id, [{ id: mixed.id, revision: mixed.revision }]));
  const originalLink = await screen.findByRole('link', { name: 'Open original post' });
  expect(originalLink.getAttribute('href')).toBe(original.permalink);
  expect((await screen.findByText(/Replacement published\. The original is still live/)).textContent).toContain('remove it manually');
});

it('selects distinct product photos, reorders the cover and requires every carousel preview to load', async () => {
  const second = 'https://images.example.test/side.webp';
  const multiProduct: ManagedProduct = { ...product, variants: [{
    id: 'variant', name: 'Pink', color: 'Pink', price: 500, inStock: true, availableQuantity: 3,
    image: product.image, imagePath: '', gallery: [{ id: 'side', image: second, imagePath: '' }],
  }] };
  mocks.products.mockResolvedValue([multiProduct]);
  const multiPost = { ...post('instagram'), request: { ...post('instagram').request,
    imageUrls: ['https://images.example.test/first.jpg', 'https://images.example.test/second.jpg'],
    sourceImageUrls: [second, product.image] } };
  mocks.prepare.mockResolvedValue([multiPost]);
  render(<MarketingSocialPosts initialProduct={multiProduct} />);
  await open();
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('disabled', false));
  expect(screen.getAllByAltText(/Available product photo/)).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Select all product photos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move photo 2 earlier' }));
  await check();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare post previews (does not publish)' }));
  await screen.findByText('Reviewed instagram caption', { selector: 'p' });
  expect(mocks.jpeg.mock.calls.map(call => call[0])).toEqual([second, product.image]);
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    sourceImageUrl: second, sourceImageUrls: [second, product.image],
  }), expect.arrayContaining([expect.any(File), expect.any(File)]));
  const savedPhotos = screen.getByRole('list', { name: 'Instagram saved photos' });
  expect(savedPhotos.textContent).toContain('Photo 1 - Cover');
  expect(savedPhotos.textContent).toContain('Photo 2');
  fireEvent.load(screen.getByAltText('Saved Instagram post preview 1'));
  expect(confirmation()).toHaveProperty('disabled', true);
  fireEvent.load(screen.getByAltText('Saved Instagram post preview 2'));
  expect(confirmation()).toHaveProperty('disabled', false);
  fireEvent.click(confirmation());
  fireEvent.click(screen.getByRole('checkbox', { name: /Photo 2$/ }));
  expect(confirmation()).toHaveProperty('checked', false);
  expect(confirmation()).toHaveProperty('disabled', true);
});

it('does not silently truncate Select all when a product has over ten photos', async () => {
  const many: ManagedProduct = { ...product, variants: [{
    id: 'variant', name: 'Pink', color: 'Pink', price: 500, inStock: true, availableQuantity: 3,
    image: product.image, imagePath: '', gallery: Array.from({ length: 10 }, (_, index) => ({
      id: String(index), image: `https://images.example.test/${index}.webp`, imagePath: '',
    })),
  }] };
  mocks.products.mockResolvedValue([many]);
  render(<MarketingSocialPosts initialProduct={many} />);
  await open();
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Select all product photos' }));
  expect((await screen.findByRole('alert')).textContent).toContain('more than 10 photos');
  expect(screen.getAllByAltText(/Selected photo/)).toHaveLength(1);
});

it('publishes only the selected platform', async () => {
  mocks.list.mockResolvedValue([post('facebook'), post('instagram')]);
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await screen.findByText('Reviewed instagram caption', { selector: 'p' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Facebook Page' }));
  await check();
  fireEvent.load(screen.getByAltText('Saved Instagram post preview'));
  fireEvent.click(confirmation());
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish LIVE' }));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(product.id, [{ id: post('instagram').id, revision: 3 }]));
});

it('prepares a WhatsApp photo without Meta checks or writes even after a Facebook post was published', async () => {
  mocks.list.mockResolvedValue([post('facebook', 'published')]);
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:whatsapp-photo');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    render(<MarketingSocialPosts initialProduct={product} />);
    await open();
    await screen.findByText('Facebook Page: Published');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare WhatsApp photo (does not send)' }));
    await screen.findByAltText('WhatsApp product photo preview');
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    cleanup();
  } finally { create.mockRestore(); revoke.mockRestore(); }
});

it('invalidates live consent after caption edits until new previews are prepared', async () => {
  mocks.list.mockResolvedValue([post('facebook')]);
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await screen.findByText('Reviewed facebook caption', { selector: 'p' });
  await check();
  fireEvent.load(screen.getByAltText('Saved Facebook Page post preview'));
  fireEvent.click(confirmation());
  fireEvent.change(screen.getByRole('textbox', { name: /Facebook Page caption/ }), { target: { value: 'Changed caption' } });
  expect(confirmation()).toHaveProperty('checked', false);
  expect(screen.getByRole('button', { name: 'Confirm and publish LIVE' })).toHaveProperty('disabled', true);
  await check();
  expect(confirmation()).toHaveProperty('disabled', true);
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('refreshes processing without publishing and requires new consent for a ready container', async () => {
  mocks.list.mockResolvedValue([post('instagram', 'processing')]);
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await screen.findByText(/Instagram is processing the image/);
  await check();
  fireEvent.click(screen.getByRole('button', { name: 'Check Instagram status' }));
  await screen.findByText(/Instagram image ready - confirm to publish/);
  expect(screen.getByRole('status').textContent).toContain('Instagram processing is complete');
  fireEvent.load(screen.getByAltText('Saved Instagram post preview'));
  expect(confirmation()).toHaveProperty('checked', false);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('explains when Instagram is still processing after a read-only status check', async () => {
  mocks.list.mockResolvedValue([post('instagram', 'processing')]);
  mocks.refresh.mockResolvedValue([post('instagram', 'processing')]);
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await screen.findByText(/Instagram is processing the image/);
  fireEvent.click(screen.getByRole('button', { name: 'Check Instagram status' }));
  await screen.findByText(/Instagram is still processing the saved post/);
  expect(mocks.refresh).toHaveBeenCalledWith(product.id);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it('does not enable uncertain posts or disabled publishing and prevents modal close while a request is pending', async () => {
  mocks.list.mockResolvedValue([post('facebook', 'needs_attention')]);
  mocks.setup.mockResolvedValue({ enabled: false, pageId: '456', pageName: 'Luvia Page' });
  render(<MarketingSocialPosts initialProduct={product} />);
  await open();
  await screen.findByText(/Needs operator attention/);
  await check();
  expect(confirmation()).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Confirm and publish LIVE' })).toHaveProperty('disabled', true);
  let finish: ((value: SocialPost[]) => void) | undefined;
  mocks.refresh.mockImplementation(() => new Promise<SocialPost[]>(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh saved posting status (read-only)' }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.getByRole('dialog')).toHaveProperty('open', true);
  expect(screen.getByRole('button', { name: 'Close Product social post' })).toHaveProperty('disabled', true);
  finish?.([post('facebook', 'needs_attention')]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close Product social post' })).toHaveProperty('disabled', false));
});
