export type Category = 'Amigurumi' | 'Apparel' | 'Home Decor' | 'Accessories' | 'Baby Items';

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number;
  /** Optional original price, shown struck-through with a discount badge when higher than `price`. */
  originalPrice?: number;
  description: string;
  color: string;
  inStock: boolean;
  image: string;
}
