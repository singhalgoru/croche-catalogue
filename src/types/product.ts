export type Category = string;
export type CatalogueFilter = Category | 'All' | 'New';

export interface CategorySettings {
  name: Category;
  priority: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  color: string;
  inStock: boolean;
  image: string;
  imagePath: string;
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
