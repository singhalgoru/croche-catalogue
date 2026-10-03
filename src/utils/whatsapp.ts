import type { Product, ProductVariant } from '../types/product';
import type { Cart } from '../types/cart';
import { getCampaignReference } from './campaign';
import { buildWhatsAppCartMessage } from './cartMessage';

// Fallback keeps local dev working if the env var isn't set; production reads
// VITE_WHATSAPP_NUMBER so the number can be rotated without a code change.
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER?.trim() || '919205907350';

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

export const getCartWhatsAppLink = (cart: Cart) =>
  whatsappLink(buildWhatsAppCartMessage(cart));
