import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from './categorySelection';

export const getCategoryShareImageUrl = (
  category: string | null | undefined,
  products: Product[],
  categorySettings: CategorySettings[],
): string => {
  if (!category || category === 'All' || category === 'New') return '';
  const settings = categorySettings.find((item) => item.name === category);
  if (settings?.isSeasonal && settings.coverImage) return settings.coverImage;
  const candidates = products.filter((product) => matchesCategory(product, category, categorySettings));
  const image = candidates.find((product) => product.image)?.image ?? '';
  return image;
};
