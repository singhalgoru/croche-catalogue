import type { Cart, CartItem } from '../types/cart';
import { formatINR } from './currency';
import { toProductUrl } from './productLink';

const PRICE_ON_ENQUIRY = 'Price on enquiry';
export const FREE_SHIPPING_THRESHOLD = 500;
export const INDICATIVE_SHIPPING_CHARGE = 100;

const productUrlFor = (item: CartItem) =>
  toProductUrl({ id: item.productId, name: item.productName, publicSlug: item.productSlug });

const lineTotal = (item: CartItem) =>
  item.unitPrice === null ? null : item.unitPrice * item.quantity;

export interface CartTotals {
  subtotal: number;
  shipping: number;
  total: number;
  hasCompletePricing: boolean;
}

export const getCartTotals = (cart: Cart): CartTotals => {
  const priced = cart.items.filter((item) => item.unitPrice !== null);
  const subtotal = priced.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : INDICATIVE_SHIPPING_CHARGE;
  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    hasCompletePricing: priced.length === cart.items.length,
  };
};

/**
 * WhatsApp renders *text* as bold. The first link in the message also gets a
 * preview card, so the leading product link doubles as a product photo.
 */
export const buildWhatsAppCartMessage = (cart: Cart) => {
  const { subtotal, shipping, total, hasCompletePricing } = getCartTotals(cart);
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
    shipping === 0
      ? `*Shipping: Free (orders ${formatINR(FREE_SHIPPING_THRESHOLD)}+)*`
      : `*Indicative shipping: ${formatINR(shipping)}*`,
    hasCompletePricing
      ? shipping === 0
        ? `*Total: ${formatINR(total)}*`
        : `*Estimated total: ${formatINR(total)} (shipping indicative)*`
      : `*Estimated total: please confirm* (some items are ${PRICE_ON_ENQUIRY.toLowerCase()})`,
    '',
    'Please confirm availability and the final total so we can proceed.',
    ...(cart.deliveryPinCode ? [`Delivery pincode (shopper-provided): ${cart.deliveryPinCode}`] : []),
    `Cart reference: ${cart.reference}`,
  ].join('\n');
};

const DIVIDER = '------------------------------';

export const buildEmailCartSubject = (cart: Cart) =>
  `Order request — Luvia cart ${cart.reference}`;

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
  const { subtotal, shipping, total, hasCompletePricing } = getCartTotals(cart);
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
    shipping === 0
      ? `SHIPPING       : Free (orders ${formatINR(FREE_SHIPPING_THRESHOLD)}+)`
      : `INDICATIVE SHIPPING : ${formatINR(shipping)}`,
    hasCompletePricing
      ? `ESTIMATED TOTAL : ${formatINR(total)}${shipping === 0 ? '' : ' (shipping indicative)'}`
      : `ESTIMATED TOTAL : please confirm (some items are ${PRICE_ON_ENQUIRY.toLowerCase()})`,
    `Cart reference  : ${cart.reference}`,
    ...(campaignReference ? [`Ref             : ${campaignReference}`] : []),
    DIVIDER,
    '',
    'DELIVERY DETAILS',
    DIVIDER,
    'Name        :',
    'Phone       :',
    'Address     :',
    `Pincode     :${cart.deliveryPinCode ? ` ${cart.deliveryPinCode} (shopper-provided)` : ''}`,
    '',
    'Please confirm availability and the final total so we can proceed.',
  ].join('\n');
};
