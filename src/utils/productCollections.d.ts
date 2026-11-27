import type { Product } from '../types/product';

export const productCollections: { path: string; title: string; description: string; intro: string; metaDescription: string; empty: string }[];
export function getBestsellerProducts(products: Product[], ids: string[]): Product[];
export function getFeaturedProducts(products: Product[]): Product[];
export function getLatestProduct(products: Product[], now?: number): Product | undefined;
