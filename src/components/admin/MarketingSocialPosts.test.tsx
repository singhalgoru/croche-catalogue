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
  fireEvent.click(screen.getByRole('button', { name: 'Create Facebook / Instagram / WhatsApp post' }));
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
  expect(screen.getByRole('dialog', { name: 'Facebook / Instagram / WhatsApp product post' })).toHaveProperty('open', true);
  expect(screen.queryByRole('option', { name: 'Hidden product' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Published product' }), { target: { value: product.id } });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(product.id));
  expect(screen.getByRole('textbox', { name: /Facebook Page caption/ })).toHaveProperty('value', expect.stringContaining('/p/crochet-bag/'));
  expect(screen.getByRole('textbox', { name: /Instagram caption/ })).toHaveProperty('value', expect.stringContaining('link in our bio'));
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
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
  fireEvent.click(screen.getByRole('button', { name: 'Refresh saved posting status (read-only)' }));
  await screen.findByText(/Instagram image ready - confirm to publish/);
  fireEvent.load(screen.getByAltText('Saved Instagram post preview'));
  expect(confirmation()).toHaveProperty('checked', false);
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
  expect(screen.getByRole('button', { name: 'Close Facebook / Instagram / WhatsApp product post' })).toHaveProperty('disabled', true);
  finish?.([post('facebook', 'needs_attention')]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close Facebook / Instagram / WhatsApp product post' })).toHaveProperty('disabled', false));
});
