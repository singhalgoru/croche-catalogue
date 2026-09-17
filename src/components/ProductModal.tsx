import { useEffect } from 'react';
import type { Product } from '../types/product';

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
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-x-hidden overflow-y-auto shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
        <div className="p-4 sm:p-6">
          <p className="text-xs uppercase tracking-wide text-cocoa/60 font-semibold">{product.category}</p>
          <h2 className="font-heading text-2xl font-semibold text-cocoa mt-1">{product.name}</h2>
          <p className="text-cocoa/80 mt-3">{product.description}</p>
          <div className="flex items-center justify-end mt-6">
            <span className={product.inStock ? 'text-green-700 font-medium' : 'text-cocoa/60 font-medium'}>
              {product.inStock ? 'In stock' : 'Sold out'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full py-2 rounded-full bg-cocoa text-cream font-semibold hover:bg-cocoa-dark transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
