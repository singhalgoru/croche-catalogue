import type { Product } from '../types/product';

export function getBoundedMetaTitle(title: string, brand?: string): string;
export function getProductMetaTitle(product: Pick<Product, 'name' | 'category'>): string;
