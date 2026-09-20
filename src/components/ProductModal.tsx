import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { Product } from '../types/product';
import { getProductWhatsAppLink } from '../utils/whatsapp';

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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const hasCarousel = totalProducts > 1;
  const whatsappOrderLink = getProductWhatsAppLink(product);

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

  useEffect(
    () => () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    },
    [],
  );

  const revealTouchControls = () => {
    setShowTouchControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      setShowTouchControls(false);
      controlsTimer.current = null;
    }, 2000);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!hasCarousel || !start || !touch) return;

    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    const isHorizontalSwipe =
      Math.abs(horizontalDistance) >= 50 &&
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.25;

    if (!isHorizontalSwipe) return;
    if (horizontalDistance < 0) onNext();
    else onPrevious();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      onTouchStartCapture={revealTouchControls}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-3 top-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/75 text-cocoa shadow-lg backdrop-blur-md transition-opacity duration-200 hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:top-5"
        style={{
          opacity: showTouchControls ? 1 : 0,
          pointerEvents: showTouchControls ? 'auto' : 'none',
        }}
        aria-label="Close product details"
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          ×
        </span>
      </button>
      <div
        className="touch-pan-y bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-x-hidden overflow-y-auto shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        <div className="relative">
          <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
          {hasCarousel && (
            <>
              <button
                type="button"
                onClick={onPrevious}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-cocoa shadow-md transition-opacity duration-200 hover:bg-mustard/90 sm:h-12 sm:w-12"
                style={{
                  opacity: showTouchControls ? 1 : 0,
                  pointerEvents: showTouchControls ? 'auto' : 'none',
                }}
                aria-label="Show previous product"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  ‹
                </span>
              </button>
              <button
                type="button"
                onClick={onNext}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-cocoa shadow-md transition-opacity duration-200 hover:bg-mustard/90 sm:h-12 sm:w-12"
                style={{
                  opacity: showTouchControls ? 1 : 0,
                  pointerEvents: showTouchControls ? 'auto' : 'none',
                }}
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
          <a
            href={whatsappOrderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-2 font-semibold text-white transition-colors hover:bg-[#1ebe5d]"
          >
            <span aria-hidden="true">💬</span>
            Order / Enquire on WhatsApp
          </a>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full py-2 rounded-full bg-cocoa text-cream font-semibold hover:bg-cocoa-dark transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
