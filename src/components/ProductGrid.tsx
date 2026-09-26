import type { Product, ProductVariant } from '../types/product';
import ProductCard from './ProductCard';

interface Props {
  products: Product[];
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy?: boolean;
  getCartQuantity: (productId: string, variantId: string) => number;
}

export default function ProductGrid({
  products,
  onSelect,
  onAddToCart,
  isCartBusy = false,
  getCartQuantity,
}: Props) {
  if (products.length === 0) {
    return (
      <p className="text-center text-rose-500 py-16">
        No items match your search. Try a different keyword or category.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          isFirstProduct={index === 0}
          isFeatured={product.featured === true}
          onSelect={onSelect}
          onAddToCart={onAddToCart}
          isCartBusy={isCartBusy}
          cartQuantity={getCartQuantity(
            product.id,
            product.variants.find((variant) => variant.inStock)?.id ?? '',
          )}
        />
      ))}
    </div>
  );
}
