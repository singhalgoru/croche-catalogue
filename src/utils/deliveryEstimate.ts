import type { Cart, DeliveryEstimate } from '../types/cart';

export const getCartItemCount = (cart: Pick<Cart, 'items'>) =>
  cart.items.reduce((sum, item) => sum + item.quantity, 0);

/**
 * Returns the saved Shiprocket estimate only while it still matches the cart:
 * a quantity change alters the parcel weight, so an older figure is hidden
 * until the shopper refreshes it.
 */
export const getCurrentDeliveryEstimate = (cart: Cart): DeliveryEstimate | null => {
  const estimate = cart.deliveryEstimate;
  if (!cart.deliveryPinCode || !estimate) return null;
  return estimate.itemCount === getCartItemCount(cart) ? estimate : null;
};

export const isDeliveryEstimateOutdated = (cart: Cart) =>
  Boolean(cart.deliveryPinCode && cart.deliveryEstimate && !getCurrentDeliveryEstimate(cart));

// Round up so the indicative figure never undercuts the cheapest courier.
export const getEstimatedShippingCharge = (estimate: DeliveryEstimate) =>
  Math.ceil(estimate.minCharge / 10) * 10;

export const formatDeliveryDays = (estimate: DeliveryEstimate) => {
  const { minDays, maxDays } = estimate;
  if (!minDays || !maxDays) return null;
  return minDays === maxDays
    ? `about ${minDays} day${minDays === 1 ? '' : 's'}`
    : `${minDays}–${maxDays} days`;
};
