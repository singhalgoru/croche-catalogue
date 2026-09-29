import type { Cart } from '../types/cart';
import { getCampaignReference } from './campaign';
import { buildEmailCartBody, buildEmailCartSubject } from './cartMessage';

export const ORDERS_EMAIL = 'orders@luviacreations.com';
export const GENERAL_EMAIL = 'hello@luviacreations.com';

// Several mail clients truncate mailto URLs around 2000 characters, which
// would drop items off the end of a large order without telling the customer.
export const MAX_MAILTO_LENGTH = 1900;

const toMailto = (subject: string, body: string) =>
  `mailto:${ORDERS_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

export const getCartEmailLink = (cart: Cart) => {
  const campaign = getCampaignReference();
  const subject = buildEmailCartSubject(cart);
  const detailed = toMailto(subject, buildEmailCartBody(cart, campaign, 'detailed'));
  if (detailed.length <= MAX_MAILTO_LENGTH) return detailed;
  return toMailto(subject, buildEmailCartBody(cart, campaign, 'compact'));
};
