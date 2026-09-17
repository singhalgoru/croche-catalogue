export type Category = 'Amigurumi' | 'Apparel' | 'Home Decor' | 'Accessories' | 'Baby Items';

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number;
  description: string;
  color: string;
  inStock: boolean;
  image: string;
}
