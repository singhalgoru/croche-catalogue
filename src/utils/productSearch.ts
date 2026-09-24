import type { Product } from '../types/product';

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

export const getProductSearchText = (product: Product) =>
  normalizeSearchText(
    [
      product.name,
      product.category,
      product.description,
      ...product.variants.map((variant) => variant.name),
    ].join(' '),
  );

export const matchesProductSearch = (product: Product, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery === '' || getProductSearchText(product).includes(normalizedQuery);
};
