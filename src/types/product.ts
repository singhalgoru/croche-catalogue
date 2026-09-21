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
  price: number;
  /** Optional original price, shown struck-through with a discount badge when higher than `price`. */
  originalPrice?: number;
  description: string;
  featured?: boolean;
  publishedAt?: string | null;
  color: string;
  inStock: boolean;
  image: string;
  variants: ProductVariant[];
}
