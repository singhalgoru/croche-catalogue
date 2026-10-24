import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProductCard from './ProductCard';
import ProductCarousel from './ProductCarousel';
import RelatedProducts from './RelatedProducts';
import type { Product } from '../types/product';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const product: Product = {
  id: 'rose', name: 'Rose', category: 'Flowers', description: '', price: 100,
  image: '/rose.webp', inStock: true, color: 'pink',
  variants: [{ id: 'pink', name: 'Pink', color: 'pink', price: null, inStock: true,
    availableQuantity: 2, image: '/rose.webp', imagePath: '', gallery: [] }],
};
const videoProduct: Product = { ...product, makingVideo: {
  title: 'Making Rose', videoUrl: 'https://videos.luviacreations.com/rose.mp4',
  posterUrl: '/rose.webp', durationSeconds: 20, width: 720, height: 720,
} };

it('marks only cards with video and preserves ordinary product selection without media requests', () => {
  const onSelect = vi.fn();
  const props = { onSelect, onAddToCart: vi.fn() };
  const { rerender, container } = render(<ProductCard {...props} product={product} />);
  expect(screen.queryByRole('link', { name: 'Watch making video for Rose' })).toBeNull();
  rerender(<ProductCard {...props} product={videoProduct} />);
  const badge = screen.getByRole('link', { name: 'Watch making video for Rose' });
  expect(badge.className).toContain('top-2 right-2');
  expect(badge.getAttribute('href')).toBe(`${window.location.origin}/p/rose/?watch=making-video#making-video`);
  expect(badge.querySelector('a, button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View Rose' }));
  expect(onSelect).toHaveBeenCalledWith(videoProduct);
  expect(container.querySelector('video, source')).toBeNull();
  rerender(<ProductCard {...props} product={{ ...videoProduct, inStock: false }} />);
  expect(screen.getByRole('link', { name: 'Watch making video for Rose' }).className).toContain('top-10');
});

it('marks carousel and related product images without adding nested controls', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const { unmount } = render(<ProductCarousel products={[videoProduct]} onSelect={vi.fn()}
    title="Featured products" label="featured product" viewAll="/featured/" description="Handpicked" />);
  const badge = screen.getByRole('link', { name: 'Watch making video for Rose' });
  expect(badge.getAttribute('href')).toContain('/p/rose/?watch=making-video#making-video');
  expect(badge.parentElement?.closest('a')).toBeNull();
  unmount();
  render(<RelatedProducts product={{ ...product, id: 'other' }} products={[videoProduct]} onSelect={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'Watch making video for Rose' }).getAttribute('href')).toContain('/p/rose/?watch=making-video#making-video');
});
