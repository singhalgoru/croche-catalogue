import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { Product } from '../types/product';
import { trackEvent, trackProductViewed, trackWhatsAppEnquiry } from '../services/analytics';
import { getProductWhatsAppLink } from '../utils/whatsapp';
import { formatINR } from '../utils/currency';
import ImageZoomViewer from './ImageZoomViewer';
import { WhatsAppIcon } from './SocialIcons';
import { isProductNew } from '../utils/productStatus';

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
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? '');
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const hasCarousel = totalProducts > 1;
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0];
  const whatsappOrderLink = getProductWhatsAppLink(product, selectedVariant);
  const isNew = isProductNew(product);

  useEffect(() => {
    trackProductViewed(product, selectedVariant);
  }, [product, selectedVariant]);

  // Close on Escape and support carousel arrow keys for keyboard accessibility.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isZoomOpen) setIsZoomOpen(false);
        else onClose();
        return;
      }

      if (!hasCarousel || isZoomOpen) return;

      if (event.key === 'ArrowLeft') onPrevious();
      if (event.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasCarousel, isZoomOpen, onClose, onNext, onPrevious]);

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
          <img
            src={selectedVariant?.image ?? product.image}
            alt={
              selectedVariant && product.variants.length > 1
                ? `${product.name} — ${selectedVariant.name}`
                : product.name
            }
            className="w-full aspect-square object-cover"
          />
          <button
            type="button"
            onClick={() => {
              trackEvent('zoom_product_image', {
                product_id: product.id,
                product_name: product.name,
                variant_name: selectedVariant?.name,
              });
              setIsZoomOpen(true);
            }}
            className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/35 text-white shadow-md backdrop-blur-md transition-colors hover:bg-black/55"
            aria-label="Zoom product image"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4M8 11h6M11 8v6" />
            </svg>
          </button>
          {isNew && (
            <span className="absolute left-3 top-3 rounded-full bg-mustard px-3 py-1 text-xs font-bold text-cocoa shadow-md">
              New
            </span>
          )}
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
          {product.variants.length > 1 && (
            <section className="mb-5" aria-label="Product variants">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-cocoa">Choose a variant</h3>
                <span
                  className={`text-xs font-semibold ${
                    selectedVariant?.inStock ? 'text-green-700' : 'text-cocoa/55'
                  }`}
                >
                  {selectedVariant?.inStock ? 'In stock' : 'Sold out'}
                </span>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {product.variants.map((variant) => {
                  const isSelected = variant.id === selectedVariant?.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        trackEvent('select_variant', {
                          product_id: product.id,
                          product_name: product.name,
                          variant_id: variant.id,
                          variant_name: variant.name,
                        });
                        setSelectedVariantId(variant.id);
                      }}
                      aria-pressed={isSelected}
                      className={`min-w-[5.5rem] rounded-xl border-2 p-1.5 text-left transition-colors ${
                        isSelected
                          ? 'border-cocoa bg-mustard/20'
                          : 'border-mustard/30 bg-white hover:border-mustard'
                      }`}
                    >
                      <img
                        src={variant.image}
                        alt=""
                        className="aspect-square w-full rounded-lg bg-cream object-cover"
                      />
                      <span className="mt-1.5 flex items-center gap-1.5 px-0.5 text-xs font-semibold text-cocoa">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-cocoa/20"
                          style={{ backgroundColor: variant.color }}
                        />
                        <span className="truncate">{variant.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
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
          {product.showPrice && product.price !== null && (
            <p className="mt-2 font-heading text-2xl font-bold text-cocoa">
              {formatINR(product.price)}
            </p>
          )}
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
            <span className={selectedVariant?.inStock ? 'text-green-700 font-medium' : 'text-cocoa/60 font-medium'}>
              {selectedVariant?.inStock ? 'In stock' : 'Sold out'}
            </span>
          </div>
          <a
            href={whatsappOrderLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppEnquiry(product, selectedVariant)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-2 font-semibold text-white transition-colors hover:bg-[#1ebe5d]"
          >
            <WhatsAppIcon />
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
      {isZoomOpen && (
        <ImageZoomViewer
          image={selectedVariant?.image ?? product.image}
          alt={
            selectedVariant && product.variants.length > 1
              ? `${product.name} — ${selectedVariant.name}`
              : product.name
          }
          onClose={() => setIsZoomOpen(false)}
        />
      )}
    </div>
  );
}
