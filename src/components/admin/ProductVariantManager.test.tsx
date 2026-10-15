import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductVariantManager from './ProductVariantManager';
import { reduceVariantStock, recordVariantSale, type ManagedProduct } from '../../services/products';

vi.mock('../../services/products', async original => ({
  ...await original<typeof import('../../services/products')>(),
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
afterEach(cleanup);

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
