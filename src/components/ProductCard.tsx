import { useEffect, useMemo, useState } from 'react';
import type { Product, ProductVariant } from '../types/product';
import { formatINR } from '../utils/currency';
import { isProductNew } from '../utils/productStatus';
import { productImageProtection } from '../utils/imageProtection';
import CartIconButton from './CartIconButton';

interface Props {
  product: Product;
  isFeatured?: boolean;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy?: boolean;
  cartQuantity?: number;
}

export default function ProductCard({
  product,
  isFeatured = false,
  onSelect,
  onAddToCart,
  isCartBusy = false,
  cartQuantity = 0,
}: Props) {
  const isNew = isProductNew(product);
  const cartVariant = product.variants.find((variant) => variant.inStock);
  const cardImages = useMemo(
    () => Array.from(new Set([
      product.image,
      ...product.variants.map((variant) => variant.image),
      ...(product.variants[0]?.gallery ?? []).map((image) => image.image),
    ].filter(Boolean))),
    [product.image, product.variants],
  );
  const [activeImage, setActiveImage] = useState({ productId: product.id, index: 0 });
  const [cartStatus, setCartStatus] =
    useState<'idle' | 'busy' | 'added' | 'error'>('idle');
  const activeImageIndex = activeImage.productId === product.id ? activeImage.index : 0;
  const activeImageUrl = cardImages[activeImageIndex] ?? product.image;

  useEffect(() => {
    if (cardImages.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveImage((currentImage) => ({
        productId: product.id,
        index:
          currentImage.productId === product.id
            ? (currentImage.index + 1) % cardImages.length
            : 1 % cardImages.length,
      }));
    }, 3500);
    return () => window.clearInterval(timer);
  }, [cardImages.length, product.id]);

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-mustard/25 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isFeatured ? 'border-2 border-mustard-dark ring-2 ring-mustard/25' : 'border border-mustard/40'
      }`}
    >
      <div className="relative aspect-square min-h-0 flex-1 overflow-hidden bg-cream-dark">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="h-full w-full"
          aria-label={`View ${product.name}`}
        >
          <img
            src={activeImageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            {...productImageProtection}
          />
        </button>
        {cardImages.length > 1 && (
          <div
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1"
            aria-hidden="true"
          >
            {cardImages.map((image, index) => (
              <span
                key={image}
                className={`h-1.5 w-1.5 rounded-full shadow-sm ${
                  index === activeImageIndex ? 'bg-white' : 'bg-white/45'
                }`}
              />
            ))}
          </div>
        )}
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
        {cartVariant && (
          <CartIconButton
            productName={product.name}
            status={cartStatus}
            onClick={() => {
              setCartStatus('busy');
              void onAddToCart(product, cartVariant).then((added) => {
                setCartStatus(added ? 'added' : 'error');
                window.setTimeout(() => setCartStatus('idle'), 1800);
              });
            }}
            disabled={isCartBusy}
            className="bottom-3 right-3"
            quantity={cartQuantity}
          />
        )}
      </div>
      <div className="shrink-0 p-4">
        <p className="text-xs uppercase tracking-wide text-cocoa/60 font-semibold">{product.category}</p>
        <h3 className="font-heading font-semibold text-cocoa mt-1">{product.name}</h3>
        {product.showPrice && product.price !== null && (
          <p className="mt-1 font-heading text-lg font-bold text-cocoa">
            {formatINR(product.price)}
          </p>
        )}
      </div>
    </article>
  );
}
