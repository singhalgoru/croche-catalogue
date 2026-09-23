import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { isProductNew } from '../utils/productStatus';
import { productImageProtection } from '../utils/imageProtection';

interface Props {
  product: Product;
  isFeatured?: boolean;
  onSelect: (product: Product) => void;
}

export default function ProductCard({ product, isFeatured = false, onSelect }: Props) {
  const isNew = isProductNew(product);

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className={`group overflow-hidden rounded-2xl bg-mustard/25 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isFeatured ? 'border-2 border-mustard-dark ring-2 ring-mustard/25' : 'border border-mustard/40'
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-cream-dark">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover"
          {...productImageProtection}
        />
        {!product.inStock && (
          <span className="absolute top-2 right-2 bg-cocoa/80 text-cream text-xs px-2 py-1 rounded-full">
            Sold out
          </span>
        )}
        {(isFeatured || isNew) && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
            {isFeatured && (
              <span className="rounded-full bg-cocoa px-2.5 py-1 text-xs font-bold text-cream shadow-md">
                ★ Featured
              </span>
            )}
            {isNew && (
              <span className="rounded-full bg-mustard px-2.5 py-1 text-xs font-bold text-cocoa shadow-md">
                New
              </span>
            )}
          </div>
        )}
        {!isFeatured && !isNew && (
          <span className="absolute top-2 left-2 flex items-center justify-center h-8 w-8 rounded-full bg-white/90 text-cocoa opacity-0 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-cocoa/60 font-semibold">{product.category}</p>
        <h3 className="font-heading font-semibold text-cocoa mt-1">{product.name}</h3>
        {product.showPrice && product.price !== null && (
          <p className="mt-1 font-heading text-lg font-bold text-cocoa">
            {formatINR(product.price)}
          </p>
        )}
      </div>
    </button>
  );
}
