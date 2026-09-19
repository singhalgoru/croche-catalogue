import type { Product } from '../types/product';

const WHATSAPP_NUMBER = '918800221074';

const whatsappLink = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

export const getGeneralWhatsAppLink = () =>
  whatsappLink('Hi Luvia, I would like to know more about your crochet catalogue.');

export const getProductWhatsAppLink = (product: Product) =>
  whatsappLink(
    `Hi Luvia, I would like to order/enquire about "${product.name}" from the ${product.category} collection.`,
  );
