import type { Product } from '../types/product';

export const productCollections: { path: string; title: string; description: string; empty: string }[];
export function getBestsellerProducts(products: Product[], ids: string[]): Product[];
export function getFeaturedProducts(products: Product[]): Product[];
