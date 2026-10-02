import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Product, ProductVariant } from '../types/product';
import { formatINR } from '../utils/currency';
import { isProductNew } from '../utils/productStatus';
import { productImageProtection } from '../utils/imageProtection';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { getProductShareDetails } from '../utils/productShare';
import { getShareableImageFile, toShareFileName } from '../utils/shareImage';
import { trackEvent } from '../services/analytics';
import CartIconButton from './CartIconButton';
import ShareIconButton from './ShareIconButton';

interface Props {
  product: Product;
  isFeatured?: boolean;
  isFirstProduct?: boolean;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy?: boolean;
  cartQuantity?: number;
}

export default function ProductCard({
  product,
  isFeatured = false,
  isFirstProduct = false,
  onSelect,
  onAddToCart,
  isCartBusy = false,
  cartQuantity = 0,
}: Props) {
  const isNew = isProductNew(product);
  const cardRef = useRef<HTMLElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(isFirstProduct);
  const cardImages = useMemo(
    () => Array.from(new Set([
      product.image,
      ...product.variants.map((variant) => variant.image),
      ...(product.variants[0]?.gallery ?? []).map((image) => image.image),
    ].filter(Boolean))),
    [product.image, product.variants],
  );
  const [activeImage, setActiveImage] = useState<{
    productId: string;
    index: number;
    variantId?: string;
  }>({
    productId: product.id,
    index: 0,
    variantId: product.variants[0]?.id,
  });
  const [cartStatus, setCartStatus] =
    useState<'idle' | 'busy' | 'added' | 'error'>('idle');
  const activeImageIndex = activeImage.productId === product.id ? activeImage.index : 0;
  const activeImageUrl = cardImages[activeImageIndex] ?? product.image;
  const previewedVariant = product.variants.find(
    (variant) => variant.id === activeImage.variantId,
  );
  const cartVariant =
    (previewedVariant?.inStock ? previewedVariant : null)
    ?? product.variants.find((variant) => variant.inStock);
  const displayedPrice = getPublicVariantPrice(product, previewedVariant ?? cartVariant);
  const shareVariant = previewedVariant ?? cartVariant ?? product.variants[0];
  const shareDetails = getProductShareDetails(product, shareVariant);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Fetch only for the photo the shopper intends to share, not every card
  // near the viewport (or every photo as the card's carousel rotates).
  // The native share call must remain synchronous with the click; while the
  // photo is loading, it falls back to sharing the product link.
  const [preparedShareFile, setPreparedShareFile] = useState<{
    image: string;
    file: File;
  } | null>(null);
  const [shareIntentImage, setShareIntentImage] = useState<string | null>(null);
  useEffect(() => {
    if (shareIntentImage !== activeImageUrl) return;
    if (preparedShareFile?.image === activeImageUrl) return;
    let cancelled = false;
    void getShareableImageFile(
      getProductImageUrl(activeImageUrl, 1080),
      toShareFileName(shareDetails.title),
    ).then((file) => {
      if (!cancelled && file) setPreparedShareFile({ image: activeImageUrl, file });
    });
    return () => {
      cancelled = true;
    };
  }, [activeImageUrl, preparedShareFile?.image, shareDetails.title, shareIntentImage]);

  const shareProduct = () => {
    const file = preparedShareFile?.image === activeImageUrl ? preparedShareFile.file : null;
    const canShareImage =
      file !== null &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });

    if (!navigator.share) {
      void navigator.clipboard
        ?.writeText(shareDetails.url)
        .then(() => setShareFeedback('Link copied!'))
        .catch(() => setShareFeedback('Unable to share.'));
      return;
    }

    // Apps like Instagram accept a shared photo but drop the accompanying
    // link text, so copy the link to the clipboard as a fallback.
    if (canShareImage) {
      navigator.clipboard?.writeText(shareDetails.url).catch(() => {});
    }

    navigator
      .share(
        canShareImage
          ? {
              title: shareDetails.title,
              text: `${shareDetails.text}\n${shareDetails.url}`,
              files: [file],
            }
          : {
              title: shareDetails.title,
              text: shareDetails.text,
              url: shareDetails.url,
            },
      )
      .then(() => {
        trackEvent('share_product', {
          method: 'native',
          product_id: product.id,
          variant_id: shareVariant?.id,
          with_image: canShareImage,
        });
        setShareFeedback(
          canShareImage ? 'Photo shared. Link copied too!' : 'Share menu opened.',
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setShareFeedback(error instanceof Error ? error.message : 'Unable to share.');
      });
  };

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    if (!cardRef.current) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsNearViewport(entry.isIntersecting),
      // Rotate only while most of the card is actually on screen, so cards
      // being scrolled past don't download every variant photo.
      { threshold: 0.6 },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNearViewport && 'IntersectionObserver' in window) return;
    if (cardImages.length <= 1) return;
    const timer = window.setInterval(() => {
      setShareIntentImage(null);
      setActiveImage((currentImage) => {
        const nextIndex =
          currentImage.productId === product.id
            ? (currentImage.index + 1) % cardImages.length
            : 1 % cardImages.length;
        return {
          productId: product.id,
          index: nextIndex,
          variantId: product.variants.find(
            (variant) => variant.image === cardImages[nextIndex],
          )?.id,
        };
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [cardImages, isNearViewport, product.id, product.variants]);

  return (
    <article
      ref={cardRef}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) return;
        onSelect(product);
      }}
      aria-label={`Product: ${product.name}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl bg-mustard/25 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isFeatured ? 'border-2 border-mustard-dark ring-2 ring-mustard/25' : 'border border-mustard/40'
      } cursor-pointer`}
    >
      <div className="relative aspect-square min-h-0 flex-1 overflow-hidden bg-cream-dark">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="h-full w-full"
          aria-label={`View ${product.name}`}
        >
          <img
            src={getProductImageUrl(activeImageUrl, 480)}
            srcSet={getProductCardSrcSet(activeImageUrl)}
            sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
            loading={isFirstProduct ? 'eager' : 'lazy'}
            fetchPriority={isFirstProduct ? 'high' : 'auto'}
            decoding="async"
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
              <span
                className="badge-glow rounded-full bg-cocoa px-2.5 py-1 text-xs font-bold text-cream shadow-md"
                style={{ '--badge-glow-color': 'rgb(246 196 83 / 0.85)' } as CSSProperties}
              >
                ★ Featured
              </span>
            )}
            {isNew && (
              <span
                className="badge-glow rounded-full bg-mustard px-2.5 py-1 text-xs font-bold text-cocoa shadow-md"
                style={{ '--badge-glow-color': 'rgb(93 64 55 / 0.55)' } as CSSProperties}
              >
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
      <div className="shrink-0 p-4 sm:p-3 lg:p-4">
        <h3 className="font-heading text-lg font-semibold text-cocoa sm:text-base">
          {product.name}
        </h3>
        {product.variants.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2" aria-label={`${product.name} variants`}>
            {product.variants.map((variant) => {
              const imageIndex = cardImages.indexOf(variant.image);
              const isActive =
                activeImage.productId === product.id && activeImage.variantId === variant.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => {
                    setShareIntentImage(null);
                    setActiveImage({
                      productId: product.id,
                      index: imageIndex >= 0 ? imageIndex : 0,
                      variantId: variant.id,
                    });
                  }}
                  aria-label={`Show ${variant.name} variant image for ${product.name}`}
                  aria-pressed={isActive}
                  title={variant.name}
                  className={`h-7 w-7 overflow-hidden rounded-full border-2 bg-cream shadow-sm transition-transform hover:scale-110 ${
                    isActive ? 'border-cocoa ring-2 ring-mustard' : 'border-white'
                  }`}
                >
                  <img
                    src={getProductImageUrl(variant.image, 96)}
                    loading="lazy"
                    decoding="async"
                    alt=""
                    className="h-full w-full object-cover"
                    {...productImageProtection}
                  />
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
          <div>
            {displayedPrice !== null && (
              <p className="font-heading text-xl font-bold text-cocoa sm:text-lg">
                {formatINR(displayedPrice)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ShareIconButton
              productName={product.name}
              onClick={shareProduct}
              onShareIntent={() => setShareIntentImage(activeImageUrl)}
              feedback={shareFeedback}
              overlay={false}
            />
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
                quantity={cartQuantity}
                overlay={false}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
