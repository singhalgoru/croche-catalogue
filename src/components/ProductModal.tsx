import { useEffect } from 'react';
import type { Product } from '../types/product';

interface Props {
  product: Product;
  currentIndex: number;
  totalProducts: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export default function ProductModal({
  product,
  currentIndex,
  totalProducts,
  onClose,
  onPrevious,
  onNext,
}: Props) {
  const hasCarousel = totalProducts > 1;

  // Close on Escape and support carousel arrow keys for keyboard accessibility.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (!hasCarousel) return;

      if (event.key === 'ArrowLeft') onPrevious();
      if (event.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasCarousel, onClose, onNext, onPrevious]);

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
        <div className="relative">
          <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
          {hasCarousel && (
            <>
              <button
                type="button"
                onClick={onPrevious}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/90 text-cocoa shadow-md flex items-center justify-center hover:bg-mustard/90 transition-colors"
                aria-label="Show previous product"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  ‹
                </span>
              </button>
              <button
                type="button"
                onClick={onNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/90 text-cocoa shadow-md flex items-center justify-center hover:bg-mustard/90 transition-colors"
                aria-label="Show next product"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  ›
                </span>
              </button>
            </>
          )}
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-cocoa/60 font-semibold">
              {product.category}
            </p>
            {hasCarousel && (
              <p className="text-xs font-semibold text-cocoa/60">
                {currentIndex + 1} / {totalProducts}
              </p>
            )}
          </div>
          <h2 className="font-heading text-2xl font-semibold text-cocoa mt-1">{product.name}</h2>
          <p className="text-cocoa/80 mt-3">{product.description}</p>
          {hasCarousel && (
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={onPrevious}
                className="py-2 rounded-full border-2 border-mustard text-cocoa font-semibold hover:bg-mustard/20 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={onNext}
                className="py-2 rounded-full border-2 border-mustard text-cocoa font-semibold hover:bg-mustard/20 transition-colors"
              >
                Next
              </button>
            </div>
          )}
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
