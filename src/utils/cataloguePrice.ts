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

export const getCataloguePriceRangeLabel = (
  range: CataloguePriceRange,
  bands: CataloguePriceBand[] = [],
): string => {
  const selectedBand = bands.find(
    band => band.minimum === range.minimum && band.maximum === range.maximum,
  );
  if (selectedBand) return selectedBand.label;
  const { minimum, maximum } = range;
  if (minimum === null) return maximum === null ? 'Any price' : `Up to ${formatINR(maximum)}`;
  if (maximum === null) return `${formatINR(minimum)}+`;
  if (minimum === maximum) return formatINR(minimum);
  if (minimum === 0) return `Up to ${formatINR(maximum)}`;
  return `${formatINR(minimum)}–${formatINR(maximum)}`;
};

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
  const cuts: number[] = [];
  for (let band = 1; band < bandCount; band += 1) {
    const nextStart = Math.ceil(uniquePrices.length * band / bandCount);
    const lower = uniquePrices[nextStart - 1];
    const upper = uniquePrices[nextStart];
    const firstBoundary = Math.ceil(lower / 100) * 100;
    const lastBoundary = Math.floor(upper / 100) * 100;
    if (firstBoundary > lastBoundary) continue;
    const boundary = Math.max(firstBoundary, Math.min(lastBoundary, Math.round((lower + upper) / 200) * 100));
    if (boundary > 0 && !cuts.includes(boundary)) cuts.push(boundary);
  }

  if (cuts.length === 0) {
    const minimum = Math.floor(uniquePrices[0] / 100) * 100;
    const maximum = Math.ceil(uniquePrices[uniquePrices.length - 1] / 100) * 100;
    return [{ minimum, maximum, label: getCataloguePriceRangeLabel({ minimum, maximum }) }];
  }

  // Adjacent suggestions share an inclusive boundary, matching their displayed labels.
  return Array.from({ length: cuts.length + 1 }, (_, index) => {
    const minimum = index === 0 ? 0 : cuts[index - 1];
    const maximum = index < cuts.length ? cuts[index] : null;
    const label = getCataloguePriceRangeLabel({ minimum, maximum });
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
