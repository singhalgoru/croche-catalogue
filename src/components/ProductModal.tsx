import { useEffect } from 'react';
import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';

interface Props {
  product: Product;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: Props) {
  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
        <div className="p-6">
          <p className="text-xs uppercase tracking-wide text-rose-500">{product.category}</p>
          <h2 className="text-2xl font-semibold text-rose-900 mt-1">{product.name}</h2>
          <p className="text-rose-700 mt-3">{product.description}</p>
          <div className="flex items-center justify-between mt-6">
            <span className="text-xl font-bold text-rose-900">{formatINR(product.price)}</span>
            <span className={product.inStock ? 'text-green-600 font-medium' : 'text-rose-500 font-medium'}>
              {product.inStock ? 'In stock' : 'Sold out'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full py-2 rounded-full bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
