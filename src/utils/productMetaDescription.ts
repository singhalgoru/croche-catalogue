import type { Product } from '../types/product';

export const getProductMetaDescription = (
  product: Pick<Product, 'name' | 'category' | 'description'>,
) => {
  const text = product.description.replace(/\s+/g, ' ').trim();
  if (/[.!?]$/.test(text) && text.length <= 160) return text;
  const first = text.match(/^.+?[.!?](?=\s|$)/)?.[0];
  if (first && first.length <= 160) return first;
  const name = product.name.replace(/\s+/g, ' ').trim();
  const category = product.category.replace(/\s+/g, ' ').trim();
  return `${name}: handmade crochet from Luvia Creations' ${category} collection. Shipped across India.`;
};
