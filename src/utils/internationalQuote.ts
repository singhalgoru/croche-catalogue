import type { Product } from '../types/product';
import internationalQuote from '../content/internationalQuote.json';
import { toProductPageUrl } from './productLink';
import { getInternationalQuoteWhatsAppLink } from './whatsapp';

export interface InternationalQuoteDetails {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  state: string;
  postalCode: string;
  address: string;
  notes: string;
}

export interface InternationalQuoteItem {
  productId: string;
  quantity: string;
}

export function buildInternationalQuote(
  details: InternationalQuoteDetails, items: InternationalQuoteItem[], products: Product[],
) {
  const required: (keyof InternationalQuoteDetails)[] = ['name', 'email', 'country', 'city', 'postalCode'];
  if (required.some(key => !details[key].trim())) {
    throw new Error('Please complete your name, reply email, country, city and ZIP / postal code.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) throw new Error('Please enter a valid reply email.');
  if (!items.length) throw new Error('Please select at least one product.');
  const selected = new Set<string>();
  const lines = items.map(item => {
    const product = products.find(candidate => candidate.id === item.productId);
    if (!product) throw new Error('Please select a current catalogue product for every item.');
    if (selected.has(product.id)) throw new Error('Each product can appear once. Update its quantity instead.');
    selected.add(product.id);
    const quantity = Number(item.quantity);
    const minimum = product.minimumOrderQuantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < minimum) {
      throw new Error(`Please enter a whole-number quantity of at least ${minimum} for ${product.name}.`);
    }
    return `${product.name} x ${quantity}\n${toProductPageUrl(product)}`;
  });
  const value = (key: keyof InternationalQuoteDetails) => details[key].trim() || 'Not provided';
  const body = [
    'Hello Luvia Creations,', '', 'INTERNATIONAL ORDER QUOTE REQUEST', '',
    'Products and quantities:', ...lines, '',
    `Contact name: ${value('name')}`, `Reply email: ${value('email')}`,
    `Phone / WhatsApp (optional): ${value('phone')}`, '',
    `Country: ${value('country')}`, `City: ${value('city')}`,
    `State / province / region: ${value('state')}`, `ZIP / postal code: ${value('postalCode')}`,
    `Street address (optional): ${value('address')}`, '',
    `Colours, customisation, delivery date or other notes: ${value('notes')}`, '',
    'Please confirm destination and product availability, payment options, shipping charges, tracking, estimated timelines, customs responsibilities and cancellation / return terms before payment.',
    'I understand this request does not confirm an order.',
  ].join('\n');
  return {
    body,
    emailHref: `mailto:${internationalQuote.email}?subject=${encodeURIComponent(internationalQuote.subject)}&body=${encodeURIComponent(body)}`,
    whatsappHref: getInternationalQuoteWhatsAppLink(body),
  };
}
