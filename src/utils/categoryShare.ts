import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from './categorySelection';
import { getCategoryImage } from './categoryImage.js';

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
