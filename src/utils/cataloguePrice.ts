import type { Product } from '../types/product';
import { formatINR } from './currency';
import { getPublicVariantPrice } from './productPrice';

export interface CataloguePriceRange {
  minimum: number | null;
  maximum: number | null;
}

export interface CataloguePriceBand extends CataloguePriceRange {
  label: string;
}

export const getCatalogueProductPrice = (product: Product) =>
  getPublicVariantPrice(product, product.variants[0]);

export const getCataloguePriceBands = (products: Product[]): CataloguePriceBand[] => {
  const prices = products
    .map(getCatalogueProductPrice)
    .filter((price): price is number => price !== null && Number.isFinite(price))
    .sort((a, b) => a - b);
  const uniquePrices = [...new Set(prices)];
  const bandCount = Math.min(4, uniquePrices.length);
  if (bandCount === 0) return [];
  if (bandCount === 1) {
    const price = uniquePrices[0];
    return [{ minimum: price, maximum: price, label: formatINR(price) }];
  }

  const cuts: number[] = [];
  for (let band = 1; band < bandCount; band += 1) {
    const nextStart = Math.ceil(uniquePrices.length * band / bandCount);
    const lower = uniquePrices[nextStart - 1];
    const upper = uniquePrices[nextStart];
    cuts.push(Math.floor((lower + upper) / 2));
  }

  return Array.from({ length: bandCount }, (_, index) => {
    const minimum = index === 0 ? 0 : cuts[index - 1] + 1;
    const maximum = index < cuts.length ? cuts[index] : null;
    const label = maximum === null
      ? `${formatINR(minimum)}+`
      : index === 0
        ? `Up to ${formatINR(maximum)}`
        : `${formatINR(minimum)}–${formatINR(maximum)}`;
    return { minimum, maximum, label };
  });
};

export const matchesCataloguePriceRange = (
  product: Product,
  range: CataloguePriceRange | null,
) => {
  if (!range) return true;
  const price = getCatalogueProductPrice(product);
  return price !== null
    && (range.minimum === null || price >= range.minimum)
    && (range.maximum === null || price <= range.maximum);
};
