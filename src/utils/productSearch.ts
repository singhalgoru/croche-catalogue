import type { Product } from '../types/product';

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

export const getProductSearchText = (product: Product) =>
  normalizeSearchText(
    [
      product.name,
      product.category,
      product.description,
      product.seoDescription,
      product.materials,
      ...product.variants.map((variant) => variant.name),
    ].join(' '),
  );

export const matchesProductSearch = (product: Product, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  const text = getProductSearchText(product);
  return normalizedQuery === '' || normalizedQuery.split(/\s+/).every(term => text.includes(term));
};
