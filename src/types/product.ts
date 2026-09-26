export type Category = string;
export type CatalogueFilter = Category | 'All' | 'New';

export interface CategorySettings {
  name: Category;
  priority: number;
}

export interface ProductVariantImage {
  id: string;
  image: string;
  imagePath: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  color: string;
  /** Optional price override in whole rupees. Falls back to the product price. */
  price: number | null;
  inStock: boolean;
  availableQuantity: number;
  image: string;
  imagePath: string;
  /** Additional angle photos (e.g. top view, side view) shown alongside the main image. */
  gallery: ProductVariantImage[];
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  /** Price in whole rupees. `null` when no price has been set yet. */
  price: number | null;
  /** Controls whether the price is shown to customers in the catalogue. */
  showPrice?: boolean;
  description: string;
  featured?: boolean;
  publishedAt?: string | null;
  color: string;
  inStock: boolean;
  image: string;
  variants: ProductVariant[];
}
