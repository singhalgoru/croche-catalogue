import type { Product, ProductVariant } from '../types/product';
import type { Cart } from '../types/cart';
import { getCampaignReference } from './campaign';
import { formatINR } from './currency';

// Fallback keeps local dev working if the env var isn't set; production reads
// VITE_WHATSAPP_NUMBER so the number can be rotated without a code change.
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER?.trim() || '918800221074';

const whatsappLink = (message: string) => {
  const reference = getCampaignReference();
  const text = reference ? `${message}\n\n(Ref: ${reference})` : message;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
};

export const getGeneralWhatsAppLink = () =>
  whatsappLink('Hi Luvia, I would like to know more about your crochet catalogue.');

export const getProductWhatsAppLink = (product: Product, variant?: ProductVariant) =>
  whatsappLink(
    `Hi Luvia, I would like to order/enquire about "${product.name}"${
      variant && product.variants.length > 1
        ? ` in the “${variant.name}” variant`
        : ''
    } from the ${product.category} collection.`,
  );

export const getCartWhatsAppLink = (cart: Cart) => {
  const pricedItems = cart.items.filter((item) => item.unitPrice !== null);
  const hasCompletePricing = pricedItems.length === cart.items.length;
  const total = pricedItems.reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
    0,
  );
  const lines = cart.items.flatMap((item, index) => [
    `${index + 1}. ${item.productName}`,
    ...(item.variantName ? [`   Variant: ${item.variantName}`] : []),
    `   Quantity: ${item.quantity}`,
    `   Price: ${
      item.unitPrice === null ? 'Price on enquiry' : `${formatINR(item.unitPrice)} each`
    }`,
  ]);

  return whatsappLink(
    [
      'Hi Luvia, I would like to enquire about these items:',
      '',
      ...lines,
      '',
      hasCompletePricing ? `Estimated total: ${formatINR(total)}` : 'Total: Please confirm',
    ].join('\n'),
  );
};
