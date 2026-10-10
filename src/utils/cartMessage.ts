import type { Cart, CartItem } from '../types/cart';
import { formatINR } from './currency';
import { getCurrentDeliveryEstimate, getEstimatedShippingCharge } from './deliveryEstimate';
import { toProductUrl } from './productLink';
import { deliveryAddressText } from './customer';

const PRICE_ON_ENQUIRY = 'Price on enquiry';
export const FREE_SHIPPING_THRESHOLD = 500;
export const INDICATIVE_SHIPPING_CHARGE = 100;

const productUrlFor = (item: CartItem) =>
  toProductUrl({ id: item.productId, name: item.productName, publicSlug: item.productSlug });

const lineTotal = (item: CartItem) =>
  item.unitPrice === null ? null : item.unitPrice * item.quantity;

export interface CartTotals {
  subtotal: number;
  /** Coupon discount on items, 0 when no coupon applies or the minimum isn't met. */
  discount: number;
  /** Amount still needed to reach the selected coupon's minimum, 0 when met or no coupon. */
  couponShortfall: number;
  shipping: number;
  /** Where the shipping figure came from: free threshold, a Shiprocket estimate for the saved pincode, or the flat fallback. */
  shippingSource: 'free' | 'estimate' | 'flat';
  total: number;
  hasCompletePricing: boolean;
}

export const getCouponDiscount = (cart: Cart, subtotal: number) => {
  const coupon = cart.coupon;
  if (!coupon || subtotal < coupon.minimumSubtotalRupees) return 0;
  return Math.min(Math.floor((subtotal * coupon.percent) / 100), coupon.maxDiscountRupees);
};

export const getCartTotals = (cart: Cart): CartTotals => {
  const priced = cart.items.filter((item) => item.unitPrice !== null);
  const subtotal = priced.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
  const discount = getCouponDiscount(cart, subtotal);
  const estimate = getCurrentDeliveryEstimate(cart);
  const shippingSource: CartTotals['shippingSource'] = subtotal - discount >= FREE_SHIPPING_THRESHOLD
    ? 'free'
    : estimate ? 'estimate' : 'flat';
  const shipping = shippingSource === 'free'
    ? 0
    : shippingSource === 'estimate' && estimate ? getEstimatedShippingCharge(estimate) : INDICATIVE_SHIPPING_CHARGE;
  return {
    subtotal,
    discount,
    couponShortfall: cart.coupon ? Math.max(0, cart.coupon.minimumSubtotalRupees - subtotal) : 0,
    shipping,
    shippingSource,
    total: subtotal - discount + shipping,
    hasCompletePricing: priced.length === cart.items.length,
  };
};

const couponLine = (cart: Cart, totals: CartTotals) => !cart.welcomeCouponCode ? null
  : totals.discount > 0 ? `Coupon ${cart.welcomeCouponCode}: -${formatINR(totals.discount)}`
    : cart.coupon ? `Coupon ${cart.welcomeCouponCode}: not applied (minimum items subtotal ${formatINR(cart.coupon.minimumSubtotalRupees)})`
      : `Requested coupon: ${cart.welcomeCouponCode} (please confirm eligibility and discount)`;

export const getShippingLabel = (cart: Cart, totals: CartTotals) =>
  totals.shippingSource === 'free'
    ? 'Shipping'
    : totals.shippingSource === 'estimate'
      ? `Approx. shipping to ${cart.deliveryPinCode}`
      : 'Indicative shipping';

/**
 * WhatsApp renders *text* as bold. The first link in the message also gets a
 * preview card, so the leading product link doubles as a product photo.
 */
export const buildWhatsAppCartMessage = (cart: Cart) => {
  const totals = getCartTotals(cart);
  const { subtotal, shipping, total, hasCompletePricing } = totals;
  const items = cart.items.flatMap((item, index) => {
    const line = lineTotal(item);
    const heading = item.variantName
      ? `*${index + 1}. ${item.productName}* (${item.variantName})`
      : `*${index + 1}. ${item.productName}*`;
    return [
      heading,
      item.unitPrice === null
        ? `Qty ${item.quantity} — ${PRICE_ON_ENQUIRY}`
        : `Qty ${item.quantity} × ${formatINR(item.unitPrice)} = ${formatINR(line ?? 0)}`,
      productUrlFor(item),
      '',
    ];
  });

  return [
    '*New order — Luvia*',
    '',
    ...items,
    `*Items subtotal: ${formatINR(subtotal)}*`,
    ...(couponLine(cart, totals) ? [`*${couponLine(cart, totals)}*`] : []),
    shipping === 0
      ? `*Shipping: Free (orders ${formatINR(FREE_SHIPPING_THRESHOLD)}+${totals.discount ? ' after coupon discounts' : ''})*`
      : `*${getShippingLabel(cart, totals)}: ${formatINR(shipping)}*`,
    hasCompletePricing
      ? shipping === 0
        ? `*Total: ${formatINR(total)}*`
        : `*Estimated total: ${formatINR(total)} (shipping indicative)*`
      : `*Estimated total: please confirm* (some items are ${PRICE_ON_ENQUIRY.toLowerCase()})`,
    '',
    'Please confirm availability and the final total so we can proceed.',
    ...(cart.deliveryPinCode ? [`Delivery pincode (shopper-provided): ${cart.deliveryPinCode}`] : []),
    ...(cart.deliveryDetails ? [
      `Recipient: ${cart.deliveryDetails.name}`,
      `Mobile: +91${cart.deliveryDetails.phone}`,
      ...(cart.deliveryDetails.email ? [`Email: ${cart.deliveryDetails.email}`] : []),
      `Delivery address (shopper-provided): ${deliveryAddressText(cart.deliveryDetails)}`,
    ] : []),
  ].join('\n');
};

const DIVIDER = '------------------------------';

export const buildEmailCartSubject = () =>
  'Order request — Luvia';

const detailedItemLines = (item: CartItem, index: number) => {
  const line = lineTotal(item);
  return [
    `${index + 1}. ${item.productName}`,
    ...(item.variantName ? [`   Variant     : ${item.variantName}`] : []),
    `   Quantity    : ${item.quantity}`,
    `   Unit price  : ${
      item.unitPrice === null ? PRICE_ON_ENQUIRY : formatINR(item.unitPrice)
    }`,
    ...(line === null ? [] : [`   Line total  : ${formatINR(line)}`]),
    `   Product     : ${productUrlFor(item)}`,
    '',
  ];
};

const compactItemLines = (item: CartItem, index: number) => {
  const line = lineTotal(item);
  const name = item.variantName
    ? `${item.productName} (${item.variantName})`
    : item.productName;
  return [
    `${index + 1}. ${name} x${item.quantity} — ${
      line === null ? PRICE_ON_ENQUIRY : formatINR(line)
    }`,
    `   ${productUrlFor(item)}`,
  ];
};

/**
 * mailto: bodies are plain text only, so structure comes from spacing and
 * rules rather than HTML. Each item links to its catalogue page, which is
 * where the photo lives.
 *
 * Some mail clients truncate mailto URLs near 2000 characters, so a compact
 * style trades the field-per-line layout for one line plus a product link.
 * Order details are placed ahead of the blank delivery form so that if a
 * client does truncate, it drops the form rather than the order.
 */
export const buildEmailCartBody = (
  cart: Cart,
  campaignReference?: string | null,
  style: 'detailed' | 'compact' = 'detailed',
) => {
  const totals = getCartTotals(cart);
  const { subtotal, shipping, total, hasCompletePricing } = totals;
  const formatItem = style === 'detailed' ? detailedItemLines : compactItemLines;
  const items = cart.items.flatMap(formatItem);

  return [
    'Hi Luvia,',
    '',
    'I would like to place an order for the items below.',
    '',
    'ORDER SUMMARY',
    DIVIDER,
    '',
    ...items,
    ...(style === 'compact' ? [''] : []),
    DIVIDER,
    `ITEMS SUBTOTAL : ${formatINR(subtotal)}`,
    ...(couponLine(cart, totals) ? [couponLine(cart, totals) as string] : []),
    shipping === 0
      ? `SHIPPING       : Free (orders ${formatINR(FREE_SHIPPING_THRESHOLD)}+${totals.discount ? ' after coupon discounts' : ''})`
      : totals.shippingSource === 'estimate'
        ? `APPROX. SHIPPING (${cart.deliveryPinCode}) : ${formatINR(shipping)}`
        : `INDICATIVE SHIPPING : ${formatINR(shipping)}`,
    hasCompletePricing
      ? `ESTIMATED TOTAL : ${formatINR(total)}${shipping === 0 ? '' : ' (shipping indicative)'}`
      : `ESTIMATED TOTAL : please confirm (some items are ${PRICE_ON_ENQUIRY.toLowerCase()})`,
    ...(campaignReference ? [`Ref             : ${campaignReference}`] : []),
    DIVIDER,
    '',
    'DELIVERY DETAILS',
    DIVIDER,
    `Name        :${cart.deliveryDetails ? ` ${cart.deliveryDetails.name}` : ''}`,
    `Phone       :${cart.deliveryDetails ? ` +91${cart.deliveryDetails.phone}` : ''}`,
    ...(cart.deliveryDetails?.email ? [`Email       : ${cart.deliveryDetails.email}`] : []),
    `Address     :${cart.deliveryDetails ? ` ${deliveryAddressText(cart.deliveryDetails)}` : ''}`,
    `Pincode     :${cart.deliveryPinCode ? ` ${cart.deliveryPinCode} (shopper-provided)` : ''}`,
    '',
    'Please confirm availability and the final total so we can proceed.',
  ].join('\n');
};
