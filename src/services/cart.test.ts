import { describe, expect, it } from 'vitest';
import { sortCartItemsByCreatedAt } from './cart';

describe('sortCartItemsByCreatedAt', () => {
  const buildRow = (id: string, createdAt: string, quantity = 1) => ({
    id,
    product_id: `product-${id}`,
    variant_id: `variant-${id}`,
    product_name: id,
    variant_name: '',
    image_url: `/${id}.jpg`,
    unit_price: 100,
    quantity,
    created_at: createdAt,
  });

  it('puts the most recently added item first', () => {
    const items = [
      buildRow('oldest', '2026-09-29T07:00:00.000Z'),
      buildRow('newest', '2026-09-29T07:10:00.000Z'),
      buildRow('middle', '2026-09-29T07:05:00.000Z'),
    ];

    expect(sortCartItemsByCreatedAt(items).map((item) => item.id)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
  });

  it('keeps an item in place when only its quantity changes', () => {
    const items = [
      buildRow('oldest', '2026-09-29T07:00:00.000Z'),
      buildRow('newest', '2026-09-29T07:10:00.000Z'),
      buildRow('middle', '2026-09-29T07:05:00.000Z'),
    ];
    const orderBefore = sortCartItemsByCreatedAt(items).map((item) => item.id);

    // Quantity updates never rewrite created_at, so ordering must be stable.
    const afterQuantityChange = items.map((item) =>
      item.id === 'oldest' ? { ...item, quantity: 7 } : item,
    );

    expect(sortCartItemsByCreatedAt(afterQuantityChange).map((item) => item.id)).toEqual(
      orderBefore,
    );
  });

  it('does not mutate the original list', () => {
    const items = [
      buildRow('oldest', '2026-09-29T07:00:00.000Z'),
      buildRow('newest', '2026-09-29T07:10:00.000Z'),
    ];

    sortCartItemsByCreatedAt(items);

    expect(items.map((item) => item.id)).toEqual(['oldest', 'newest']);
  });
});
