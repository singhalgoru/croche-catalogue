import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ProductDiscount from './ProductDiscount';
import type { Product } from '../types/product';

afterEach(cleanup);
const product: Product = {
  id: 'p', name: 'Rose', category: 'Decor', price: 400, regularPrice: 500,
  discountPercent: 20, showPrice: true, description: '', color: '', inStock: true, image: '', variants: [],
};
it('shows the regular price, percentage and saving', () => {
  render(<ProductDiscount product={product} />);
  expect(screen.getByText('₹500').tagName).toBe('DEL');
  expect(screen.getByText('20% off')).toBeTruthy();
  expect(screen.getByText('Save ₹100 per piece')).toBeTruthy();
});
it('uses a variant override regular price rather than the product regular price', () => {
  render(<ProductDiscount product={product} variant={{
    id: 'v', name: 'Pink', price: 600, regularPrice: 750, color: '', inStock: true,
    availableQuantity: 5, image: '', imagePath: '', gallery: [],
  }} />);
  expect(screen.getByText('₹750')).toBeTruthy();
  expect(screen.getByText('Save ₹150 per piece')).toBeTruthy();
});
it.each([
  { ...product, showPrice: false }, { ...product, discountPercent: 0 },
  { ...product, regularPrice: 400 }, { ...product, regularPrice: null },
])('does not claim savings for hidden, inactive or unchanged prices', value => {
  const { container } = render(<ProductDiscount product={value} />);
  expect(container.textContent).toBe('');
});
