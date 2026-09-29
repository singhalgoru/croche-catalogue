import type { Cart } from '../types/cart';
import { getCampaignReference } from './campaign';
import { buildCartSummaryLines } from './whatsapp';

export const ORDERS_EMAIL = 'orders@luviacreations.com';
export const GENERAL_EMAIL = 'hello@luviacreations.com';

export const getCartEmailLink = (cart: Cart) => {
  const campaign = getCampaignReference();
  const subject = `Order request — Luvia cart ${cart.reference}`;
  const body = [
    'Hi Luvia,',
    '',
    'I would like to place an order for these items:',
    '',
    ...buildCartSummaryLines(cart),
    '',
    'Please confirm availability and the final total so we can proceed.',
    '',
    'My delivery details:',
    'Name:',
    'Phone:',
    'Address:',
    'Pincode:',
    '',
    `Cart reference: ${cart.reference}`,
    ...(campaign ? [`Ref: ${campaign}`] : []),
  ].join('\n');

  return `mailto:${ORDERS_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
};
