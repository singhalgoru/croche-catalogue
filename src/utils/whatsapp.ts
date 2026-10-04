import type { Product, ProductVariant } from '../types/product';
import type { Cart } from '../types/cart';
import { getCampaignReference } from './campaign';
import { buildWhatsAppCartMessage } from './cartMessage';
import { toProductPageUrl, toPublicVariantSlug } from './productLink';

// Fallback keeps local dev working if the env var isn't set; production reads
// VITE_WHATSAPP_NUMBER so the number can be rotated without a code change.
export const getWhatsAppNumber = () =>
  (import.meta.env.VITE_WHATSAPP_NUMBER?.trim() || '919205907350').replace(/\D/g, '');

export const formatWhatsAppNumber = (number = getWhatsAppNumber()) => {
  const digits = number.replace(/\D/g, '');
  if (/^91\d{10}$/.test(digits)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
};

const whatsappLink = (message: string) => {
  const reference = getCampaignReference();
  const text = reference ? `${message}\n\n(Ref: ${reference})` : message;
  return `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(text)}`;
};

export const getGeneralWhatsAppLink = () =>
  whatsappLink('Hi Luvia, I would like to know more about your crochet catalogue.');

export const getProductWhatsAppLink = (product: Product, variant?: ProductVariant) => {
  const url = new URL(toProductPageUrl(product));
  if (variant) url.searchParams.set('variant', toPublicVariantSlug(variant));
  return whatsappLink(
    `Hi Luvia, I'm interested in ${product.name}${
      variant?.name.trim()
        ? ` — ${variant.name.trim()}`
        : ''
    }.\n\n${url.href}`,
  );
};

export const getCartWhatsAppLink = (cart: Cart) =>
  whatsappLink(buildWhatsAppCartMessage(cart));
