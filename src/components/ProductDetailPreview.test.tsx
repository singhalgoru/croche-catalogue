import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ProductDetailPreview from './ProductDetailPreview';
import type { Product } from '../types/product';

afterEach(cleanup);
it('keeps real photos, descriptions and confirmed facts visible while interactive controls load', () => {
  const product: Product = {
    id: 'bunny', name: 'Bunny Toy', category: 'Toys', description: 'A handmade lavender bunny.',
    materials: 'Cotton yarn', price: 100, inStock: true, color: '#ffffff', variants: [],
    image: 'https://images.luviacreations.com/products/admin/bunny.webp',
  };
  render(<ProductDetailPreview product={product} />);
  expect(screen.getByRole('heading', { name: 'Bunny Toy', level: 1 })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Bunny Toy' }).getAttribute('src')).toContain('-w960.webp');
  expect(screen.getByText(product.description)).toBeTruthy();
  expect(screen.getByText('Cotton yarn')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Bunny Toy details' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
});
