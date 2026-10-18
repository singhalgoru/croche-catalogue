import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import CollectionGrid from './CollectionGrid';
import { products } from '../data/products';

afterEach(cleanup);

it('deters saving both collection photo layers while preserving collection navigation', () => {
  render(<CollectionGrid categories={[{ name: 'Decor', priority: 1, coverImage: '/scene.webp' }]}
    products={[{ ...products[0], category: 'Decor' }]} />);
  const link = screen.getByRole('link', { name: 'Decor' });
  expect(link.getAttribute('href')).toBe('/collections/decor/');
  const images = link.querySelectorAll('img');
  expect(images).toHaveLength(2);
  for (const image of images) {
    expect(image.draggable).toBe(false);
    expect(fireEvent.contextMenu(image)).toBe(false);
    expect(image.style.userSelect).toBe('none');
  }
});
