import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addProductToCart,
  clearCart,
  fetchCart,
  markCartWhatsAppStarted,
  removeCartItem,
  updateCartItemQuantity,
} from '../services/cart';
import type { Cart } from '../types/cart';
import type { Product, ProductVariant } from '../types/product';

export function useCart(enabled = true) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const runCartAction = useCallback(async (action: () => Promise<Cart>) => {
    setIsBusy(true);
    setError(null);
    try {
      const nextCart = await action();
      setCart(nextCart);
      return nextCart;
    } catch (actionError) {
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
    addItem: (product: Product, variant: ProductVariant) =>
      runCartAction(() => addProductToCart(product, variant)),
    updateQuantity: (itemId: string, quantity: number) =>
      runCartAction(() => updateCartItemQuantity(itemId, quantity)),
    removeItem: (itemId: string) => runCartAction(() => removeCartItem(itemId)),
    clear: () => runCartAction(clearCart),
    markWhatsAppStarted: () => runCartAction(markCartWhatsAppStarted),
  };
}
