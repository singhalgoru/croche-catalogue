import type { Product, ProductVariant } from '../types/product';
import { getCampaignReference } from './campaign';

const WHATSAPP_NUMBER = '918800221074';

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
      variant && (product.variants.length > 1 || variant.name !== 'Default')
        ? ` in the “${variant.name}” variant`
        : ''
    } from the ${product.category} collection.`,
  );
