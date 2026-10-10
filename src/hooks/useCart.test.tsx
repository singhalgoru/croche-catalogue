import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cart } from '../types/cart';
import type { Product, ProductVariant } from '../types/product';
import { useCart } from './useCart';

const { fetchCart, addProductToCart, trackAddToCart, captureCartNetwork } = vi.hoisted(() => ({
  fetchCart: vi.fn(),
  addProductToCart: vi.fn(),
  trackAddToCart: vi.fn(),
  captureCartNetwork: vi.fn(),
}));
vi.mock('../services/cart', () => ({
  fetchCart, addProductToCart, captureCartNetwork,
  clearCart: vi.fn(), markCartWhatsAppStarted: vi.fn(), removeCartItem: vi.fn(),
  updateCartItemQuantity: vi.fn(), updateCartDeliveryPin: vi.fn(),
}));
vi.mock('../services/analytics', () => ({ trackAddToCart }));

const variant: ProductVariant = {
  id: 'pink', name: 'Pink', color: 'pink', price: null, inStock: true,
  availableQuantity: 1, image: '/rose.webp', imagePath: 'rose.webp', gallery: [],
};
const product: Product = {
  id: 'rose', name: 'Rose', category: 'Flowers', price: 200, description: 'Handmade rose',
  color: 'pink', inStock: true, image: '/rose.webp', variants: [variant],
};
const cart: Cart = {
  id: 'cart', reference: 'CRT-TEST', status: 'active', updatedAt: '2026-10-08T00:00:00Z',
  expiresAt: '2026-11-08T00:00:00Z', whatsappStartedAt: null, items: [],
};
let frame: FrameRequestCallback;

beforeEach(() => {
  vi.useFakeTimers();
  fetchCart.mockResolvedValue(null);
  addProductToCart.mockResolvedValue(cart);
  captureCartNetwork.mockResolvedValue(undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frame = callback;
    return 1;
  });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('publishes the confirmed cart and feedback before running analytics after paint', async () => {
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(result.current.cart).toBe(cart);
  expect(result.current.addFeedback).toBe('Rose added to cart');
  expect(result.current.isBusy).toBe(false);
  expect(result.current.cartUpdateCount).toBe(1);
  expect(trackAddToCart).not.toHaveBeenCalled();
  act(() => frame(0));
  expect(trackAddToCart).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(0));
  expect(trackAddToCart).toHaveBeenCalledExactlyOnceWith(product, variant);
});

it('does not publish success or track an unsuccessful cart addition', async () => {
  addProductToCart.mockRejectedValue(new Error('Unable to save cart'));
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(result.current.error).toBe('Unable to save cart');
  expect(result.current.addFeedback).toBeNull();
  expect(result.current.cartUpdateCount).toBe(0);
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  expect(trackAddToCart).not.toHaveBeenCalled();
});

it('tracks successful background additions without waiting for a suspended animation frame', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(0));
  expect(trackAddToCart).toHaveBeenCalledExactlyOnceWith(product, variant);
});

it('captures the nonempty cart once without delaying confirmed cart feedback', async () => {
  const populated = { ...cart, items: [{
    id: 'item', productId: product.id, variantId: variant.id, productName: product.name,
    variantName: variant.name, image: variant.image, unitPrice: 200, quantity: 1,
  }] };
  addProductToCart.mockResolvedValue(populated);
  captureCartNetwork.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(result.current.isBusy).toBe(false);
  expect(result.current.addFeedback).toBe('Rose added to cart');
  expect(captureCartNetwork).toHaveBeenCalledExactlyOnceWith(cart.id);
  await act(async () => { await result.current.addItem(product, variant); });
  expect(captureCartNetwork).toHaveBeenCalledTimes(1);
});

it('does not capture empty carts', async () => {
  fetchCart.mockResolvedValue(cart);
  renderHook(() => useCart());
  await act(async () => {});
  expect(captureCartNetwork).not.toHaveBeenCalled();
});
