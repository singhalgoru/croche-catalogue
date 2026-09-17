import type { Product } from '../types/product';

interface Props {
  product: Product;
  onSelect: (product: Product) => void;
}

export default function ProductCard({ product, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="text-left bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className="relative">
        <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
        {!product.inStock && (
          <span className="absolute top-2 right-2 bg-rose-900/80 text-white text-xs px-2 py-1 rounded-full">
            Sold out
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-rose-500">{product.category}</p>
        <h3 className="font-semibold text-rose-900 mt-1">{product.name}</h3>
        <p className="text-rose-700 font-medium mt-2">${product.price.toFixed(2)}</p>
      </div>
    </button>
  );
}
