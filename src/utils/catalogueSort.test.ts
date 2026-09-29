import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { sortCatalogueProducts } from './catalogueSort';

const NOW = Date.parse('2026-09-29T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: overrides.name ?? 'product',
    name: 'Product',
    category: 'Hair Accessories',
    description: '',
    price: 100,
    showPrice: true,
    inStock: true,
    images: [],
    variants: [],
    featured: false,
    publishedAt: new Date(NOW - 30 * DAY).toISOString(),
    ...overrides,
  }) as Product;

const namesOf = (products: Product[]) => products.map((product) => product.name);

describe('sortCatalogueProducts', () => {
  it('lists featured products first even when the manual order puts them last', () => {
    // Mirrors the live catalogue, where a featured item sat at sort_order 33.
    const products = [
      buildProduct({ name: 'Cute Bunny', sortOrder: 0 }),
      buildProduct({ name: 'Boho braids', sortOrder: 4 }),
      buildProduct({ name: 'Emoji Keychain', sortOrder: 33, featured: true }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW }))).toEqual([
      'Emoji Keychain',
      'Cute Bunny',
      'Boho braids',
    ]);
  });

  it('ranks featured above new', () => {
    const products = [
      buildProduct({
        name: 'New arrival',
        sortOrder: 0,
        publishedAt: new Date(NOW - DAY).toISOString(),
      }),
      buildProduct({ name: 'Featured', sortOrder: 20, featured: true }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW }))).toEqual([
      'Featured',
      'New arrival',
    ]);
  });

  it('ranks new products above the rest of the manual order', () => {
    const products = [
      buildProduct({ name: 'Established', sortOrder: 0 }),
      buildProduct({
        name: 'Just published',
        sortOrder: 30,
        publishedAt: new Date(NOW - DAY).toISOString(),
      }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW }))).toEqual([
      'Just published',
      'Established',
    ]);
  });

  it('keeps the manual catalogue order within each group', () => {
    const products = [
      buildProduct({ name: 'Featured second', sortOrder: 9, featured: true }),
      buildProduct({ name: 'Plain second', sortOrder: 12 }),
      buildProduct({ name: 'Featured first', sortOrder: 2, featured: true }),
      buildProduct({ name: 'Plain first', sortOrder: 11 }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW }))).toEqual([
      'Featured first',
      'Featured second',
      'Plain first',
      'Plain second',
    ]);
  });

  it('stops promoting a product once it is no longer new', () => {
    const products = [
      buildProduct({ name: 'Established', sortOrder: 0 }),
      buildProduct({
        name: 'Published four days ago',
        sortOrder: 30,
        publishedAt: new Date(NOW - 4 * DAY).toISOString(),
      }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW }))).toEqual([
      'Established',
      'Published four days ago',
    ]);
  });

  it('falls back to category priority when no manual order exists', () => {
    const categoryRanks = new Map([
      ['Rakhi', 0],
      ['Hair Accessories', 1000],
    ]);
    const products = [
      buildProduct({ name: 'Hair item', category: 'Hair Accessories' }),
      buildProduct({ name: 'Rakhi item', category: 'Rakhi' }),
    ];

    expect(namesOf(sortCatalogueProducts(products, { now: NOW, categoryRanks }))).toEqual([
      'Rakhi item',
      'Hair item',
    ]);
  });
});
