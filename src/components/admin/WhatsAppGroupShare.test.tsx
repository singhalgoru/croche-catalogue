import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WhatsAppGroupShare from './WhatsAppGroupShare';
import type { ManagedProduct } from '../../services/products';

const jpeg = vi.hoisted(() => vi.fn());
vi.mock('../../utils/imageUploadConversion', () => ({ prepareSocialPostJpeg: jpeg }));
const product: ManagedProduct = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Crochet bag', publicSlug: 'crochet-bag',
  category: 'Bags', description: 'Handmade bag', price: 500, color: 'Pink', inStock: true, variants: [],
  image: 'https://images.example.test/bag.webp', imagePath: 'products/bag.webp', published: true,
  publishedAt: null, createdAt: '2026-01-01T00:00:00Z',
};
const share = vi.fn();
const copy = vi.fn();
const revoke = vi.fn();
const onBusyChange = vi.fn();
const renderShare = () => render(<WhatsAppGroupShare product={product} disabled={false} onBusyChange={onBusyChange} />);
const prepare = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare WhatsApp photo (does not send)' }));
  const image = await screen.findByAltText('WhatsApp product photo preview');
  fireEvent.load(image);
  return image;
};
beforeEach(() => {
  vi.resetAllMocks();
  jpeg.mockResolvedValue(new File(['jpeg'], 'social-post.jpg', { type: 'image/jpeg' }));
  share.mockResolvedValue(undefined);
  copy.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share, canShare: () => true, clipboard: { writeText: copy } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:whatsapp-photo');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('prepares locally without sharing, then shares the reviewed JPEG and edited caption on a separate click', async () => {
  const view = renderShare();
  expect(jpeg).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Share photo to WhatsApp group' })).toHaveProperty('disabled', true);
  await prepare();
  expect(jpeg).toHaveBeenCalledWith(product.image);
  expect(share).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'WhatsApp caption' }), { target: { value: 'Our new bag!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Share photo to WhatsApp group' }));
  expect(share).toHaveBeenCalledWith({
    title: product.name, files: [expect.objectContaining({ name: 'crochet-bag.jpg', type: 'image/jpeg' })],
    text: `Our new bag!\n\nShop: ${window.location.origin}/p/crochet-bag/`,
  });
  await screen.findByText(/Share menu closed/);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  view.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:whatsapp-photo');
});

it('offers caption/link copy and text-only WhatsApp when native file sharing is unsupported', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
  renderShare();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New bag & colours' } });
  const expected = `New bag & colours\n\nShop: ${window.location.origin}/p/crochet-bag/`;
  expect(screen.getByRole('link', { name: 'Open WhatsApp with text only' }).getAttribute('href'))
    .toBe(`https://wa.me/?text=${encodeURIComponent(expected)}`);
  fireEvent.click(screen.getByRole('button', { name: 'Copy WhatsApp caption' }));
  await screen.findByText(/Caption and product link copied/);
  expect(copy).toHaveBeenCalledWith(expected);
  await prepare();
  expect(screen.getByRole('button', { name: 'Share photo to WhatsApp group' })).toHaveProperty('disabled', true);
  const download = screen.getByRole('link', { name: 'Download WhatsApp photo' });
  expect(download.getAttribute('href')).toBe('blob:whatsapp-photo');
  expect(download.getAttribute('download')).toBe('crochet-bag.jpg');
  expect(share).not.toHaveBeenCalled();
});

it('copies WhatsApp formatting markers for selected text without changing the product link', async () => {
  renderShare();
  const caption = screen.getByRole('textbox', { name: 'WhatsApp caption' }) as HTMLTextAreaElement;
  fireEvent.change(caption, { target: { value: 'Lovely bag' } });
  caption.setSelectionRange(0, 6);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(caption.value).toBe('*Lovely* bag');
  caption.setSelectionRange(9, 12);
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  expect(caption.value).toBe('*Lovely* _bag_');
  fireEvent.click(screen.getByRole('button', { name: 'Copy WhatsApp caption' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(
    `*Lovely* _bag_\n\nShop: ${window.location.origin}/p/crochet-bag/`,
  ));
  expect(screen.getByRole('link', { name: 'Open WhatsApp with text only' }).getAttribute('href'))
    .toBe(`https://wa.me/?text=${encodeURIComponent(`*Lovely* _bag_\n\nShop: ${window.location.origin}/p/crochet-bag/`)}`);
});

it('adds WhatsApp list markers and emojis to the caption', () => {
  renderShare();
  const caption = screen.getByRole('textbox', { name: 'WhatsApp caption' }) as HTMLTextAreaElement;
  fireEvent.change(caption, { target: { value: 'First\nSecond' } });
  caption.setSelectionRange(0, caption.value.length);
  fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
  expect(caption.value).toBe('- First\n- Second');
  caption.setSelectionRange(caption.value.length, caption.value.length);
  fireEvent.click(screen.getByText('Add emoji to WhatsApp caption'));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Smiling face' }));
  expect(caption.value).toBe('- First\n- Second😊');
});

it('surfaces preparation and clipboard failures and allows retry without sharing', async () => {
  jpeg.mockRejectedValueOnce(new Error('Photo download failed.'));
  copy.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
  renderShare();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare WhatsApp photo (does not send)' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toBe('Photo download failed.');
  await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Copy WhatsApp caption' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Clipboard permission denied.'));
  expect(share).not.toHaveBeenCalled();
});

it('handles native-share cancellation and rejection without claiming publication or retrying', async () => {
  share.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
  renderShare();
  await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Share photo to WhatsApp group' }));
  await screen.findByText('Sharing cancelled. Delivery has not been verified.');
  share.mockRejectedValueOnce(new Error('Sharing is blocked. Download the photo instead.'));
  fireEvent.click(screen.getByRole('button', { name: 'Share photo to WhatsApp group' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toBe('Sharing is blocked. Download the photo instead.');
  expect(share).toHaveBeenCalledTimes(2);
});

it('blocks native sharing when the photo preview fails', async () => {
  renderShare();
  const image = await prepare();
  fireEvent.error(image);
  expect(screen.getByRole('button', { name: 'Share photo to WhatsApp group' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('alert').textContent).toContain('Download and inspect');
  expect(share).not.toHaveBeenCalled();
});
