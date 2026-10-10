import { beforeEach, expect, it, vi } from 'vitest';
import { captureCartNetwork, fetchAdminCarts } from './cart';

const { invoke, from, select } = vi.hoisted(() => ({
  invoke: vi.fn(), from: vi.fn(), select: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({
  isSupabaseConfigured: true,
  loadSupabase: async () => ({ functions: { invoke }, from }),
}));
beforeEach(() => vi.clearAllMocks());

it('sends only the cart ID to the capture endpoint and propagates failures', async () => {
  invoke.mockResolvedValue({ error: null });
  await captureCartNetwork('cart-id');
  expect(invoke).toHaveBeenCalledWith('capture-cart-network', { body: { cartId: 'cart-id' } });
  invoke.mockResolvedValue({ error: { message: 'Unauthorized' } });
  await expect(captureCartNetwork('cart-id')).rejects.toThrow('Unauthorized');
});

it.each([false, true])('maps protected admin metadata for object and array relations (%s)', async asArray => {
  const network = { ip_address: '203.0.113.9', captured_at: '2026-10-10T00:00:00Z',
    location: { city: 'Meerut', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', provider: 'geolite2' } };
  const row = {
    id: 'cart', user_id: 'owner', reference: 'CRT-TEST', status: 'active',
    updated_at: '', created_at: '', expires_at: '', whatsapp_started_at: null,
    cart_items: [{ id: 'item', product_id: 'p', variant_id: 'v', product_name: 'Rose',
      variant_name: '', image_url: '', unit_price: 100, quantity: 1, created_at: '' }],
    cart_network_details: asArray ? [network] : network,
  };
  const query = { select, gte: () => query, order: async () => ({ data: [row], error: null }) };
  select.mockReturnValue(query);
  from.mockReturnValue(query);
  const carts = await fetchAdminCarts();
  expect(select).toHaveBeenCalledWith(expect.stringContaining('cart_network_details(ip_address,captured_at,location)'));
  expect(carts[0].networkDetails).toEqual({ ipAddress: network.ip_address, capturedAt: network.captured_at, location: network.location });
});
