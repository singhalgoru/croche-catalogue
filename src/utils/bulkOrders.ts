import bulkOrders from '../content/bulkOrders.json';

export interface BulkOrderEnquiry {
  name: string;
  company: string;
  email: string;
  occasion: string;
  products: string;
  quantity: string;
  budget: string;
  city: string;
  date: string;
  preferences: string;
}

export function buildBulkOrderEmail(enquiry: BulkOrderEnquiry) {
  const value = (key: keyof BulkOrderEnquiry) => enquiry[key].trim() || 'To be discussed';
  const body = [
    'Hello Luvia Creations,', '',
    'I would love to explore thoughtful handmade crochet gifts for my team, clients or a special occasion.', '',
    'BULK ORDERS & CORPORATE GIFTING ENQUIRY', '',
    `Contact name: ${value('name')}`,
    `Company / organisation: ${value('company')}`,
    `Reply email: ${value('email')}`,
    `Occasion / event: ${value('occasion')}`,
    `Products or ideas: ${value('products')}`,
    `Approximate quantity: ${value('quantity')}`,
    `Budget per gift (INR): ${value('budget')}`,
    `Delivery country, city / postal code: ${value('city')}`,
    `Required delivery date: ${value('date')}`,
    `Customisation / packaging preferences: ${value('preferences')}`, '',
    'Please help me explore suitable options and share pricing and preparation timelines.', '',
    'Thank you,', value('name'),
  ].join('\r\n');
  return {
    subject: bulkOrders.subject,
    body,
    href: `mailto:${bulkOrders.email}?subject=${encodeURIComponent(bulkOrders.subject)}&body=${encodeURIComponent(body)}`,
  };
}
