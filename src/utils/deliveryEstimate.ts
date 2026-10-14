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
    ? `about ${minDays} day${minDays === 1 ? '' : 's'} after dispatch`
    : `${minDays}–${maxDays} days after dispatch`;
};

export const formatEstimatedDeliveryDateRange = (
  estimate: DeliveryEstimate,
  referenceDate = new Date(),
) => {
  const { minDays, maxDays } = estimate;
  if (minDays === null || maxDays === null
    || !Number.isInteger(minDays) || !Number.isInteger(maxDays)
    || minDays < 0 || maxDays < minDays) return null;

  const indiaDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(indiaDateParts.find(part => part.type === type)?.value);
  const orderDate = new Date(Date.UTC(datePart('year'), datePart('month') - 1, datePart('day')));
  const earliest = new Date(orderDate);
  const latest = new Date(earliest);
  earliest.setUTCDate(earliest.getUTCDate() + minDays + 1);
  latest.setUTCDate(latest.getUTCDate() + maxDays + 5);

  const formatDate = (date: Date) => new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  return `${formatDate(earliest)}–${formatDate(latest)}`;
};
