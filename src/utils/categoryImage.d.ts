import type { CategoryHotspot, CategorySettings, Product } from '../types/product';
export function getCategoryImage(products: Product[], settings?: CategorySettings): string;
export function getCategoryHotspots(products: Product[], settings?: CategorySettings): (CategoryHotspot & { product: Product })[];
