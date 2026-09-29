import { describe, expect, it } from 'vitest';
import { sortCartItemsByCreatedAt } from './cart';

describe('sortCartItemsByCreatedAt', () => {
  it('keeps cart items in their original creation order', () => {
    const items = [
      {
        id: 'item-2',
        product_id: 'product-2',
        variant_id: 'variant-2',
        product_name: 'Second',
        variant_name: '',
        image_url: '/second.jpg',
        unit_price: 200,
        quantity: 1,
        created_at: '2026-09-29T07:05:00.000Z',
      },
      {
        id: 'item-1',
        product_id: 'product-1',
        variant_id: 'variant-1',
        product_name: 'First',
        variant_name: '',
        image_url: '/first.jpg',
        unit_price: 100,
        quantity: 1,
        created_at: '2026-09-29T07:00:00.000Z',
      },
    ];

    const sorted = sortCartItemsByCreatedAt(items);

    expect(sorted.map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(items.map((item) => item.id)).toEqual(['item-2', 'item-1']);
  });
});
