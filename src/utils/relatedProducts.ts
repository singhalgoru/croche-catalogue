import type { Product } from '../types/product';

const publicationTime = (product: Product) => {
  const time = product.publishedAt ? Date.parse(product.publishedAt) : NaN;
  return Number.isFinite(time) ? time : 0;
};

export function getRelatedProducts(product: Product, publishedProducts: Product[]): Product[] {
  return publishedProducts
    .filter(candidate => candidate.id !== product.id && candidate.category === product.category)
    .sort((left, right) =>
      Number(right.inStock) - Number(left.inStock)
      || publicationTime(right) - publicationTime(left)
      || left.id.localeCompare(right.id))
    .slice(0, 4);
}
