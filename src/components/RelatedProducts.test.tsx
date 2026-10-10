import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import RelatedProducts from './RelatedProducts';

const product: Product = {
  id: 'current', name: 'Coaster', category: 'Home', price: 100, description: '',
  color: '#ffffff', inStock: true, image: '/coaster.webp', variants: [],
};
const related = { ...product, id: 'related', name: 'Flower Coaster', showPrice: true };
afterEach(cleanup);

describe('RelatedProducts', () => {
  it('hides the entire section when no same-category recommendations exist', () => {
    const { container } = render(<RelatedProducts product={product} products={[product]} onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('uses product-page links, two mobile columns and four desktop columns', () => {
    const onSelect = vi.fn();
    render(<RelatedProducts product={product} products={[product, related]} onSelect={onSelect} />);
    expect(screen.getByRole('heading', { name: 'You May Also Like' })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Flower Coaster/ });
    expect(link.getAttribute('href')).toContain('/p/flower-coaster/');
    expect(link.parentElement?.className).toContain('grid-cols-2');
    expect(link.parentElement?.className).toContain('lg:grid-cols-4');
    expect(screen.getByText('₹100')).toBeTruthy();
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledWith(related);
  });

  it('preserves native modified-click navigation and hides private prices', () => {
    const onSelect = vi.fn();
    render(<RelatedProducts product={product} products={[{ ...related, showPrice: false, inStock: false }]} onSelect={onSelect} />);
    expect(screen.queryByText('₹100')).toBeNull();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
