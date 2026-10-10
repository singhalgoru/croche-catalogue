import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addProductToCart,
  clearCart,
  fetchCart,
  markCartWhatsAppStarted,
  removeCartItem,
  updateCartItemQuantity,
  updateCartDeliveryPin,
  captureCartNetwork,
  saveCartDeliveryDetails,
  selectCartWelcomeCoupon,
} from '../services/cart';
import type { DeliveryDetails } from '../types/customer';
import { trackAddToCart } from '../services/analytics';
import type { Cart } from '../types/cart';
import type { Product, ProductVariant } from '../types/product';
import { loadSupabase } from '../lib/supabaseConfig';

export function useCart(enabled = true) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);
  const [cartUpdateCount, setCartUpdateCount] = useState(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedNetworkCartIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    let unsubscribe: (() => void) | undefined;
    void loadSupabase().then(client => {
      if (!current || !client) return;
      const { data } = client.auth.onAuthStateChange(event => {
        if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED' && event !== 'SIGNED_OUT') return;
        window.setTimeout(() => {
          if (!current) return;
          void fetchCart().then(value => { if (current) setCart(value); },
            error => { if (current) setError(error instanceof Error ? error.message : 'Unable to restore account cart.'); });
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => { current = false; unsubscribe?.(); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !cart?.items.length || capturedNetworkCartIds.current.has(cart.id)) return;
    capturedNetworkCartIds.current.add(cart.id);
    void captureCartNetwork(cart.id).catch(error => console.error('Cart network capture failed:', error));
  }, [cart, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let isCurrent = true;
    void fetchCart().then(
      (nextCart) => {
        if (!isCurrent) return;
        setCart(nextCart);
        setError(null);
        setIsLoading(false);
      },
      (loadError: unknown) => {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to restore your cart.');
        setIsLoading(false);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [enabled]);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const runCartAction = useCallback(async (action: () => Promise<Cart>, reportAtField = false) => {
    setIsBusy(true);
    setError(null);
    try {
      const nextCart = await action();
      setCart(nextCart);
      return nextCart;
    } catch (actionError) {
      if (reportAtField) throw actionError;
      setError(actionError instanceof Error ? actionError.message : 'Unable to update your cart.');
      return null;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const itemCount = useMemo(
    () => cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [cart],
  );

  return {
    cart,
    itemCount,
    isLoading,
    isBusy,
    error,
    dismissError: () => setError(null),
    addFeedback,
    cartUpdateCount,
    addItem: async (product: Product, variant: ProductVariant) => {
      const nextCart = await runCartAction(() => addProductToCart(product, variant));
      if (nextCart) {
        setAddFeedback(
          `${product.name}${
            product.variants.length > 1 ? ` — ${variant.name}` : ''
          } added to cart`,
        );
        setCartUpdateCount((count) => count + 1);
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setAddFeedback(null), 2400);
        // Let the confirmed cart render before third-party analytics runs.
        const track = () => window.setTimeout(() => trackAddToCart(product, variant), 0);
        if (document.visibilityState === 'hidden') track();
        else window.requestAnimationFrame(track);
      }
      return nextCart;
    },
    updateQuantity: (itemId: string, quantity: number, minimumQuantity = 1) =>
      runCartAction(() => updateCartItemQuantity(itemId, quantity, minimumQuantity)),
    removeItem: (itemId: string) => runCartAction(() => removeCartItem(itemId)),
    clear: () => runCartAction(clearCart),
    saveDeliveryPin: (value: string) => runCartAction(() => updateCartDeliveryPin(value), true),
    saveDeliveryDetails: (value: DeliveryDetails) => runCartAction(() => saveCartDeliveryDetails(value), true),
    selectWelcomeCoupon: (code: string) => runCartAction(() => selectCartWelcomeCoupon(code), true),
    markWhatsAppStarted: () => runCartAction(markCartWhatsAppStarted),
  };
}
