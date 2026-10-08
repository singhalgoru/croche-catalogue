import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addProductToCart, removeCartItem, updateCartItemQuantity } from './cart';
import type { Product } from '../types/product';

const { from, getSession, upsert, update, remove, single, maybeSingle } = vi.hoisted(() => ({
  from: vi.fn(), getSession: vi.fn(), upsert: vi.fn(), update: vi.fn(),
  remove: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({
  isSupabaseConfigured: true,
  loadSupabase: async () => ({ auth: { getSession }, from }),
}));

const item = {
  id: 'item-1', product_id: 'product-1', variant_id: 'variant-1',
  product_name: 'Flower', variant_name: 'Pink', image_url: '/flower.webp',
  unit_price: 100, quantity: 1, created_at: '2026-10-08T10:00:00Z',
};
const row = {
  id: 'cart-1', user_id: 'user-1', reference: 'CRT-TEST', status: 'active',
  created_at: '2026-10-08T10:00:00Z', updated_at: '2026-10-08T10:00:00Z',
  expires_at: '2099-01-01T00:00:00Z', whatsapp_started_at: null, cart_items: [item],
};
const product: Product = {
  id: 'product-1', name: 'Flower', category: 'Decor', description: 'A flower',
  price: 100, showPrice: true, image: '/flower.webp', color: '#ffffff', inStock: true,
  variants: [{ id: 'variant-1', name: 'Pink', price: null, image: '/flower.webp',
    color: '#ffffff', inStock: true, availableQuantity: 10, imagePath: 'flower.webp', gallery: [] }],
};

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
  maybeSingle.mockResolvedValue({ data: row, error: null });
  single.mockResolvedValue({ data: { ...row, cart_items: [{ ...item, quantity: 2, unit_price: 125 }] }, error: null });
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle, single,
    upsert, update, delete: remove,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  upsert.mockReturnValue(query);
  update.mockReturnValue(query);
  remove.mockReturnValue(query);
  from.mockReturnValue(query);
});

describe('remote cart mutation requests', () => {
  it('adds using three requests and the authoritative saved cart, without a second GET', async () => {
    const cart = await addProductToCart(product, product.variants[0]);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['carts', 'cart_items', 'carts']);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }), expect.anything());
    expect(cart.items[0]).toMatchObject({ quantity: 2, unitPrice: 125 });
  });

  it.each(['update', 'remove'])('returns the refreshed cart directly after %s', async action => {
    maybeSingle.mockResolvedValue({ data: { ...row, cart_items: [item, { ...item, id: 'item-2' }] }, error: null });
    if (action === 'update') await updateCartItemQuantity('item-1', 2);
    else await removeCartItem('item-1');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(3);
  });

  it('surfaces refresh failures instead of reporting success', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'Connection failed' } });
    await expect(addProductToCart(product, product.variants[0]))
      .rejects.toThrow('Unable to refresh your cart: Connection failed');
  });
});
