import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import { HomepageCustomisation, HomepageSpotlight } from './HomepageDiscover';

const product: Product = {
  id: 'one', name: 'Crochet flower', publicSlug: 'crochet-flower', category: 'Gifts',
  description: '', price: 250, showPrice: true, color: '', inStock: true,
  image: '/flower.webp', publishedAt: '2020-01-01T00:00:00Z',
  variants: [{ id: 'red', name: 'Red', color: '', price: 300, image: '/red.webp',
    imagePath: '', gallery: [], inStock: true, availableQuantity: 1 }],
};

afterEach(cleanup);

describe('HomepageDiscover', () => {
  it('links to a customisation draft and opens the latest product', () => {
    const onSelect = vi.fn();
    render(<><HomepageCustomisation /><HomepageSpotlight products={[product]} onSelect={onSelect} /></>);
    const link = screen.getByRole('link', { name: /discuss your idea/i });
    const url = new URL(link.getAttribute('href')!);
    expect(url.hostname).toBe('wa.me');
    expect(url.searchParams.get('text')).toContain('price and dispatch estimate');
    const section = screen.getByRole('region', { name: 'Latest from Luvia' });
    expect(within(section).getByText('₹300')).toBeTruthy();
    const productLink = within(section).getByRole('link', { name: /crochet flower/i });
    expect(productLink.getAttribute('href')).toContain('/p/crochet-flower/');
    fireEvent.click(productLink);
    expect(onSelect).toHaveBeenCalledWith(product);
    fireEvent.click(productLink, { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('hides private prices and omits the spotlight when no eligible product exists', () => {
    const { rerender } = render(<><HomepageCustomisation /><HomepageSpotlight products={[{ ...product, showPrice: false }]} onSelect={vi.fn()} /></>);
    expect(screen.queryByText('₹300')).toBeNull();
    rerender(<><HomepageCustomisation /><HomepageSpotlight products={[{ ...product, publishedAt: null }]} onSelect={vi.fn()} /></>);
    expect(screen.queryByRole('region', { name: 'Latest from Luvia' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Make it your own' })).toBeTruthy();
  });
});
