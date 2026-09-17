import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';

interface Props {
  product: Product;
  onSelect: (product: Product) => void;
}

export default function ProductCard({ product, onSelect }: Props) {
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)
    : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group text-left bg-mustard/25 rounded-2xl shadow-sm border border-mustard/40 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className="relative">
        <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
        {!product.inStock && (
          <span className="absolute top-2 right-2 bg-cocoa/80 text-cream text-xs px-2 py-1 rounded-full">
            Sold out
          </span>
        )}
        <span className="absolute top-2 left-2 flex items-center justify-center h-8 w-8 rounded-full bg-white/90 text-cocoa opacity-0 group-hover:opacity-100 transition-opacity">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-cocoa/60 font-semibold">{product.category}</p>
        <h3 className="font-heading font-semibold text-cocoa mt-1">{product.name}</h3>
        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
          <p className="text-cocoa font-bold">{formatINR(product.price)}</p>
          {hasDiscount && (
            <>
              <p className="text-cocoa/40 line-through text-sm">{formatINR(product.originalPrice!)}</p>
              <p className="text-green-700 text-xs font-semibold">{discountPercent}% Off</p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
