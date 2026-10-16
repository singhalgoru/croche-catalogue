import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from './categorySelection';
import { getCategoryHotspots, getCategoryImage } from './categoryImage.js';

export const getCategoryShareImageUrl = (
  category: string | null | undefined,
  products: Product[],
  categorySettings: CategorySettings[],
): string => {
  if (!category || category === 'All' || category === 'New') return '';
  const settings = categorySettings.find((item) => item.name === category);
  const candidates = products.filter((product) => matchesCategory(product, category, categorySettings));
  return getCategoryImage(candidates, settings);
};

export const getCategoryShareHotspots = (
  category: string | null | undefined, products: Product[], categorySettings: CategorySettings[] = [],
) => getCategoryHotspots(
  products.filter(product => category && matchesCategory(product, category, categorySettings)),
  categorySettings.find(item => item.name === category),
);
