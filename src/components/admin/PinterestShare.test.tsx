import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PinterestShare from './PinterestShare';
import type { ManagedProduct } from '../../services/products';

const prepare = vi.hoisted(() => vi.fn());
vi.mock('../../utils/pinterestShare', () => ({ preparePinterestPin: prepare }));
const product: ManagedProduct = {
  id: 'product-1', name: 'Crochet bag', publicSlug: 'crochet-bag', category: 'Bags',
  description: '**Handmade** bag', price: 500, color: 'Pink', inStock: true, variants: [],
  image: 'https://images.example.test/bag.webp', imagePath: 'products/bag.webp',
  published: true, publishedAt: null, createdAt: '2026-01-01T00:00:00Z',
};
const copy = vi.fn();
const onBusyChange = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  prepare.mockResolvedValue(new File(['jpeg'], 'crochet-bag-pinterest.jpg', { type: 'image/jpeg' }));
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pinterest');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const renderShare = () => render(<PinterestShare product={product} disabled={false} onBusyChange={onBusyChange} />);
const prepareButton = () => screen.getByRole('button', { name: 'Prepare Pinterest image (does not publish)' });

it('prepares only on request, copies separate editable fields and keeps publication in Pinterest', async () => {
  renderShare();
  expect(prepare).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Pinterest description/)).toHaveProperty('value', 'Handmade bag');
  fireEvent.change(screen.getByLabelText(/Pinterest title/), { target: { value: 'Premium handmade bag' } });
  fireEvent.change(screen.getByLabelText(/Pinterest description/), { target: { value: 'A colourful gift idea.' } });
  fireEvent.click(prepareButton());
  await screen.findByAltText('Pinterest pin preview');
  expect(prepare).toHaveBeenCalledWith(product, 'Premium handmade bag');
  const download = screen.getByRole('link', { name: 'Download Pinterest image' });
  expect(download.getAttribute('href')).toBe('blob:pinterest');
  expect(download.getAttribute('download')).toBe('crochet-bag-pinterest.jpg');
  for (const [label, expected] of [
    ['title', 'Premium handmade bag'], ['description', 'A colourful gift idea.'],
    ['product link', 'https://luviacreations.com/p/crochet-bag/'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name: `Copy Pinterest ${label}` }));
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(expected));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  }
  expect(screen.getByRole('link', { name: 'Open Pinterest to create pin' }).getAttribute('href'))
    .toBe('https://www.pinterest.com/pin-creation-tool/');
  expect(screen.getByText(/This website cannot publish or verify a pin/)).toBeTruthy();
});

it('invalidates and releases the generated image when the title changes', async () => {
  const view = renderShare();
  fireEvent.click(prepareButton());
  await screen.findByAltText('Pinterest pin preview');
  fireEvent.change(screen.getByLabelText(/Pinterest title/), { target: { value: 'Updated title' } });
  expect(screen.queryByAltText('Pinterest pin preview')).toBeNull();
  expect(screen.getByText('Download Pinterest image').getAttribute('href')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pinterest');
  fireEvent.click(prepareButton());
  await waitFor(() => expect(prepare).toHaveBeenLastCalledWith(product, 'Updated title'));
  await screen.findByAltText('Pinterest pin preview');
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it('reports preparation and clipboard failures, permits retry and never claims publication', async () => {
  prepare.mockRejectedValueOnce(new Error('Photo could not load.'));
  copy.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
  renderShare();
  fireEvent.click(prepareButton());
  expect((await screen.findByRole('alert')).textContent).toBe('Photo could not load.');
  expect(screen.queryByAltText('Pinterest pin preview')).toBeNull();
  fireEvent.click(prepareButton());
  await screen.findByAltText('Pinterest pin preview');
  fireEvent.click(screen.getByRole('button', { name: 'Copy Pinterest title' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Clipboard permission denied.'));
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(screen.queryByText(/^Published/)).toBeNull();
});

it('blocks incomplete preparation and explains unavailable clipboard access', async () => {
  vi.stubGlobal('navigator', {});
  renderShare();
  fireEvent.change(screen.getByLabelText(/Pinterest title/), { target: { value: ' ' } });
  expect(prepareButton()).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Copy Pinterest product link' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Select and copy');
  expect(prepare).not.toHaveBeenCalled();
});
