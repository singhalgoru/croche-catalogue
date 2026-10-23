import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cart } from '../types/cart';
import type { Product, ProductVariant } from '../types/product';
import { useCart } from './useCart';

const { fetchCart, addProductToCart, trackCartChanges, captureCartNetwork, updateQuantity, removeItem, clear } = vi.hoisted(() => ({
  fetchCart: vi.fn(),
  addProductToCart: vi.fn(),
  trackCartChanges: vi.fn(),
  captureCartNetwork: vi.fn(),
  updateQuantity: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
}));
vi.mock('../services/cart', () => ({
  fetchCart, addProductToCart, captureCartNetwork,
  clearCart: clear, markCartWhatsAppStarted: vi.fn(), removeCartItem: removeItem,
  updateCartItemQuantity: updateQuantity, updateCartDeliveryPin: vi.fn(),
}));
vi.mock('../services/analytics', () => ({ trackCartChanges, trackEvent: vi.fn() }));

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

it('refreshes the settled server cart and badge without clearing newly added items', async () => {
  const { result } = renderHook(() => useCart());
  await act(async () => {});
  const remaining = { ...cart, items: [{
    id: 'new-item', productId: product.id, variantId: variant.id, productName: product.name,
    variantName: variant.name, image: variant.image, unitPrice: 200, quantity: 2,
  }] };
  fetchCart.mockResolvedValueOnce(remaining);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.cart).toEqual(remaining);
  expect(result.current.itemCount).toBe(2);
  expect(clear).not.toHaveBeenCalled();
  expect(trackCartChanges).not.toHaveBeenCalled();
  fetchCart.mockResolvedValueOnce(cart);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.itemCount).toBe(0);
});

it('publishes the confirmed cart and feedback before running analytics after paint', async () => {
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(result.current.cart).toBe(cart);
  expect(result.current.addFeedback).toBe('Rose added to cart');
  expect(result.current.isBusy).toBe(false);
  expect(result.current.cartUpdateCount).toBe(1);
  expect(trackCartChanges).not.toHaveBeenCalled();
  act(() => frame(0));
  expect(trackCartChanges).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(0));
  expect(trackCartChanges).toHaveBeenCalledExactlyOnceWith(null, cart);
});

it('does not publish success or track an unsuccessful cart addition', async () => {
  addProductToCart.mockRejectedValue(new Error('Unable to save cart'));
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(result.current.error).toBe('Unable to save cart');
  expect(result.current.addFeedback).toBeNull();
  expect(result.current.cartUpdateCount).toBe(0);
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  expect(trackCartChanges).not.toHaveBeenCalled();
});

it('tracks successful background additions without waiting for a suspended animation frame', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { result } = renderHook(() => useCart());
  await act(async () => { await result.current.addItem(product, variant); });
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(0));
  expect(trackCartChanges).toHaveBeenCalledExactlyOnceWith(null, cart);
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

it('tracks quantity, removal and clear deltas only after confirmed mutations', async () => {
  const populated = { ...cart, items: [{
    id: 'item', productId: 'rose', variantId: 'pink', productName: 'Rose',
    variantName: 'Pink', image: '/rose.webp', unitPrice: 200, quantity: 2,
  }] };
  fetchCart.mockResolvedValue(populated);
  const { result } = renderHook(() => useCart());
  await act(async () => {});
  const updated = { ...populated, items: [{ ...populated.items[0], quantity: 3 }] };
  updateQuantity.mockResolvedValue(updated);
  await act(async () => { await result.current.updateQuantity('item', 3); });
  act(() => { frame(0); vi.advanceTimersByTime(0); });
  expect(trackCartChanges).toHaveBeenLastCalledWith(populated, updated);
  removeItem.mockRejectedValue(new Error('Cannot remove'));
  await act(async () => { await result.current.removeItem('item'); });
  expect(trackCartChanges).toHaveBeenCalledTimes(1);
  clear.mockResolvedValue(cart);
  await act(async () => { await result.current.clear(); });
  act(() => { frame(0); vi.advanceTimersByTime(0); });
  expect(trackCartChanges).toHaveBeenLastCalledWith(updated, cart);
});

it('does not capture empty carts', async () => {
  fetchCart.mockResolvedValue(cart);
  renderHook(() => useCart());
  await act(async () => {});
  expect(captureCartNetwork).not.toHaveBeenCalled();
});
