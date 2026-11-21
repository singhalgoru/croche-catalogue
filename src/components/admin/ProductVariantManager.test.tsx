import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductVariantManager from './ProductVariantManager';
import { addVariantGalleryImage, reduceVariantStock, recordVariantSale, type ManagedProduct } from '../../services/products';
import VariantDraftFields from './VariantDraftFields';
import { createEmptyVariant } from './variantDraft';

vi.mock('../../services/products', async original => ({
  ...await original<typeof import('../../services/products')>(),
  addVariantGalleryImage: vi.fn(),
  reduceVariantStock: vi.fn(),
  recordVariantSale: vi.fn(),
}));

const product: ManagedProduct = {
  id: 'p1', name: 'Rose', category: 'Decor', description: 'Handmade rose.',
  price: 100, showPrice: true, inStock: true, color: '#ffffff', image: '/rose.webp',
  imagePath: 'rose.webp', published: true, publishedAt: null, createdAt: '',
  variants: [{
    id: 'v1', name: 'Pink', color: '#ffffff', price: null, inStock: true,
    availableQuantity: 5, image: '/rose.webp', imagePath: 'rose.webp', gallery: [],
  }],
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([6 * 1024 * 1024 + 1, 20 * 1024 * 1024])(
  'accepts a %i-byte primary and gallery image in new-product drafts',
  size => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:source');
      static revokeObjectURL = vi.fn();
    });
    const variant = createEmptyVariant();
    const onChange = vi.fn();
    const { container } = render(<VariantDraftFields variants={[variant]} onChange={onChange} />);
    const file = new File([new Uint8Array(size)], 'large.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Variant image'), { target: { files: [file] } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ imageFile: file })]);
    fireEvent.change(container.querySelector('input[type="file"][multiple]')!, { target: { files: [file] } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ galleryFiles: [file] })]);
  },
);

it('accepts a 20 MB managed gallery photo and explicitly rejects one byte over the source limit', () => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:source');
    static revokeObjectURL = vi.fn();
  });
  render(<ProductVariantManager product={product} onSaved={vi.fn()} />);
  const input = screen.getByLabelText('Add an additional photo to Pink');
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(20 * 1024 * 1024)], 'large.png', { type: 'image/png' })] } });
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' })] } });
  expect(screen.getByRole('alert').textContent).toContain('non-empty image no larger than 20 MB');
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

it('shows a 16 MB angle selection, upload progress, and a retryable failure beside the picker', async () => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:source');
    static revokeObjectURL = vi.fn();
  });
  let rejectUpload: (error: Error) => void = () => { throw new Error('Upload did not start'); };
  vi.mocked(addVariantGalleryImage).mockImplementationOnce(() => new Promise((_, reject) => { rejectUpload = reject; }));
  render(<ProductVariantManager product={product} onSaved={vi.fn()} />);
  const file = new File([new Uint8Array(16 * 1024 * 1024)], 'angle.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Add an additional photo to Pink'), { target: { files: [file] } });
  expect(screen.getByText(/angle.png selected — not uploaded yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Upload angle photo' }));
  expect(screen.getByText(/Preparing and uploading the angle photo/)).toBeTruthy();
  expect(addVariantGalleryImage).toHaveBeenCalledWith(product, product.variants[0], file);
  rejectUpload(new Error('Upload connection lost'));
  expect((await screen.findByRole('alert')).textContent).toContain('Upload connection lost');
  expect(screen.getByRole('button', { name: 'Upload angle photo' })).toBeTruthy();
});

it('shows explicit feedback for invalid angle photos and selections exceeding remaining draft slots', () => {
  const variant = { ...createEmptyVariant(), galleryFiles: Array.from({ length: 5 }, () => new File(['x'], 'existing.png', { type: 'image/png' })),
    galleryPreviewUrls: ['1', '2', '3', '4', '5'] };
  const onChange = vi.fn();
  render(<VariantDraftFields variants={[variant]} onChange={onChange} />);
  const input = screen.getByLabelText('Add additional angle photos');
  fireEvent.change(input, { target: { files: [new File(['x'], 'one.png', { type: 'image/png' }), new File(['x'], 'two.png', { type: 'image/png' })] } });
  expect(screen.getByRole('alert').textContent).toContain('Only 1 more angle photo');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [new File(['x'], 'image.heic', { type: 'image/heic' })] } });
  expect(screen.getByRole('alert').textContent).toContain('JPG, PNG or WebP');
});

it('offers a separate reduction and reports confirmed success without recording a sale', async () => {
  const saved = { ...product, variants: [{ ...product.variants[0], availableQuantity: 3 }] };
  vi.mocked(reduceVariantStock).mockResolvedValue(saved);
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<ProductVariantManager product={product} onSaved={onSaved} />);
  expect(screen.getByText('Stock adjustment (not a sale)')).toBeTruthy();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity to reduce for Pink' }), {
    target: { value: '2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reduce stock for Pink' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved,
    'Reduced stock by 2 for "Pink". No sale was recorded.'));
  expect(reduceVariantStock).toHaveBeenCalledExactlyOnceWith(product, product.variants[0], 2);
  expect(recordVariantSale).not.toHaveBeenCalled();
});

it('keeps the quantity and displays the backend failure without a success notification', async () => {
  vi.mocked(reduceVariantStock).mockRejectedValue(new Error('2 item(s) are reserved for active payments.'));
  const onSaved = vi.fn();
  render(<ProductVariantManager product={product} onSaved={onSaved} />);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity to reduce for Pink' }), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reduce stock for Pink' }));
  expect(await screen.findByText('2 item(s) are reserved for active payments.')).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: 'Quantity to reduce for Pink' })).toHaveProperty('value', '4');
  expect(onSaved).not.toHaveBeenCalled();
  expect(recordVariantSale).not.toHaveBeenCalled();
});

it('disables stock reduction at zero and sets native whole-number input limits', () => {
  const { rerender } = render(<ProductVariantManager product={product} onSaved={vi.fn()} />);
  const input = screen.getByRole('spinbutton', { name: 'Quantity to reduce for Pink' });
  expect(input.getAttribute('min')).toBe('1');
  expect(input.getAttribute('max')).toBe('5');
  expect(input.getAttribute('step')).toBe('1');
  rerender(<ProductVariantManager product={{
    ...product, variants: [{ ...product.variants[0], availableQuantity: 0, inStock: false }],
  }} onSaved={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Reduce stock for Pink' })).toHaveProperty('disabled', true);
  expect(input).toHaveProperty('disabled', true);
});
