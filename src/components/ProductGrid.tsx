import type { Product } from '../types/product';
import ProductCard from './ProductCard';

interface Props {
  products: Product[];
  onSelect: (product: Product) => void;
}

export default function ProductGrid({ products, onSelect }: Props) {
  if (products.length === 0) {
    return (
      <p className="text-center text-rose-500 py-16">
        No items match your search. Try a different keyword or category.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isFeatured={product.featured === true}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
