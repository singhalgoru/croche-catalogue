import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import type { Product, ProductVariant } from '../types/product';
import { trackEvent, trackProductViewed, trackWhatsAppEnquiry } from '../services/analytics';
import { getProductWhatsAppLink } from '../utils/whatsapp';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';
import ImageZoomViewer from './ImageZoomViewer';
import {
  CopyIcon,
  FacebookIcon,
  InstagramIcon,
  RedditIcon,
  ShareIcon,
  SnapchatIcon,
  WhatsAppIcon,
} from './SocialIcons';
import { isProductNew } from '../utils/productStatus';
import CartIconButton from './CartIconButton';
import ProductQuantityControl from './ProductQuantityControl';
import ProductDetails from './ProductDetails';
import type { CartItem } from '../types/cart';
import { getProductShareDetails } from '../utils/productShare';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getShareableImageFile, toShareFileName } from '../utils/shareImage';
import { toProductPageUrl } from '../utils/productLink';

interface Props {
  product: Product;
  currentIndex: number;
  totalProducts: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onAddToCart?: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy?: boolean;
  getCartQuantity?: (productId: string, variantId: string) => number;
  getCartItem?: (productId: string, variantId: string) => CartItem | undefined;
  onUpdateCartItem?: (itemId: string, quantity: number) => Promise<boolean>;
  onRemoveCartItem?: (itemId: string) => Promise<boolean>;
  initialVariantId?: string;
  presentation?: 'modal' | 'page';
  onOpenFullDetails?: (variantId: string) => void;
}

interface GalleryImage {
  id: string;
  image: string;
  variantId?: string;
}

export default function ProductModal({
  product,
  currentIndex,
  totalProducts,
  onClose,
  onPrevious,
  onNext,
  onAddToCart,
  isCartBusy = false,
  getCartQuantity,
  getCartItem,
  onUpdateCartItem,
  onRemoveCartItem,
  initialVariantId,
  presentation = 'modal',
  onOpenFullDetails,
}: Props) {
  const isPage = presentation === 'page';
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const initialVariant =
    product.variants.find((variant) => variant.id === initialVariantId) ?? product.variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialVariant?.id ?? '',
  );
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [activeImageId, setActiveImageId] = useState(
    initialVariant?.gallery.length ? 'main' : `variant:${initialVariant?.id ?? ''}`,
  );
  const [cartStatus, setCartStatus] =
    useState<'idle' | 'busy' | 'added' | 'error'>('idle');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [hasChosenImage, setHasChosenImage] = useState(Boolean(initialVariantId));
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const hasCarousel = !isPage && totalProducts > 1;
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0];
  const displayedPrice = getPublicVariantPrice(product, selectedVariant);
  const selectedCartItem = selectedVariant
    ? getCartItem?.(product.id, selectedVariant.id)
    : undefined;
  const galleryImages = useMemo((): GalleryImage[] => {
    if (selectedVariant?.gallery.length) {
      return [
        { id: 'main', image: selectedVariant.image },
        ...selectedVariant.gallery.map((item) => ({ id: item.id, image: item.image })),
      ];
    }

    const variantImages = product.variants
      .map((variant) => ({
        id: `variant:${variant.id}`,
        image: variant.image,
        variantId: variant.id,
      }))
      .filter((item, index, items) =>
        item.image && items.findIndex((candidate) => candidate.image === item.image) === index,
      );

    return variantImages.length > 1
      ? variantImages
      : [{ id: 'main', image: selectedVariant?.image ?? product.image }];
  }, [product.image, product.variants, selectedVariant]);
  const activeImageIndex = Math.max(
    galleryImages.findIndex((item) => item.id === activeImageId),
    0,
  );
  const activeImage =
    galleryImages[activeImageIndex]?.image ?? galleryImages[0].image;
  // The thumbnail strip is only meaningful when the selected variant has its
  // own extra angle photos. Otherwise galleryImages falls back to one photo
  // per variant, which would duplicate the "Choose a variant" picker below.
  const hasAngleThumbnails = Boolean(selectedVariant?.gallery.length);
  const whatsappOrderLink = getProductWhatsAppLink(product, selectedVariant);
  const isNew = isProductNew(product);
  const openWhatsAppOrder = () => trackWhatsAppEnquiry(product, selectedVariant);
  const openImageZoom = () => {
    trackEvent('zoom_product_image', {
      product_id: product.id,
      product_name: product.name,
      variant_name: selectedVariant?.name,
    });
    setIsZoomOpen(true);
  };
  const shareDetails = getProductShareDetails(product, selectedVariant);

  // Prepare the photo only after the share options are opened; a normal
  // product view no longer downloads a separate 1080px image. Until it is
  // ready, the synchronous native share call shares the link instead.
  const [preparedShareFile, setPreparedShareFile] = useState<{
    image: string;
    file: File;
  } | null>(null);
  useEffect(() => {
    if (!isShareOpen) return;
    if (preparedShareFile?.image === activeImage) return;
    let cancelled = false;
    void getShareableImageFile(
      getProductImageUrl(activeImage, 1080),
      toShareFileName(shareDetails.title),
    ).then((file) => {
      if (!cancelled && file) setPreparedShareFile({ image: activeImage, file });
    });
    return () => {
      cancelled = true;
    };
  }, [activeImage, isShareOpen, preparedShareFile?.image, shareDetails.title]);

  const shareNatively = (method = 'native') => {
    if (!navigator.share) {
      setShareFeedback('Native sharing is not available. Use WhatsApp, Facebook, Reddit, or Copy link.');
      return;
    }

    const file = preparedShareFile?.image === activeImage ? preparedShareFile.file : null;
    // Attach the product photo when the target app supports shared files
    // (Web Share API level 2). Apps like Instagram only show a plain text
    // link otherwise, so this lets the photo come along with the share.
    const canShareImage =
      file !== null &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });

    // Many apps (notably Instagram Direct, Stories, and Feed) accept a
    // shared photo but silently drop any accompanying caption/link text.
    // Copy the link to the clipboard as a fallback so it's ready to paste
    // once the user lands in the target app. Best-effort: clipboard access
    // can fail on some browsers, and Copy link remains available regardless.
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
          method,
          product_id: product.id,
          variant_id: selectedVariant?.id,
          with_image: canShareImage,
        });
        setShareFeedback(
          canShareImage
            ? 'Photo shared. Product link copied too — paste it if the app drops it.'
            : 'Share menu opened.',
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setShareFeedback(error instanceof Error ? error.message : 'Unable to open the share menu.');
      });
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareDetails.url);
      trackEvent('share_product', {
        method: 'copy_link',
        product_id: product.id,
        variant_id: selectedVariant?.id,
      });
      setShareFeedback('Product link copied.');
    } catch (error) {
      setShareFeedback(error instanceof Error ? error.message : 'Unable to copy the product link.');
    }
  };

  useEffect(() => {
    trackProductViewed(product, selectedVariant);
  }, [product, selectedVariant]);

  useEffect(() => {
    // Auto-rotation previews the other photos on open, but it must stop once
    // the shopper picks something: it also switches selectedVariantId, so
    // letting it run would silently change which variant gets ordered.
    if (hasChosenImage || galleryImages.length <= 1 || isZoomOpen) return;
    const timer = window.setInterval(() => {
      setActiveImageId((currentId) => {
        const currentIndex = Math.max(
          galleryImages.findIndex((item) => item.id === currentId),
          0,
        );
        const nextImage = galleryImages[(currentIndex + 1) % galleryImages.length];
        if (nextImage.variantId) setSelectedVariantId(nextImage.variantId);
        return nextImage.id;
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [galleryImages, isZoomOpen, hasChosenImage]);

  useEffect(() => {
    // The actions row is pinned to the bottom, so the share panel opens
    // beneath it. Bring it into view instead of leaving it off-screen.
    if (!isShareOpen) return;
    sharePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isShareOpen]);

  const selectVariant = (variantId: string) => {
    setHasChosenImage(true);
    setSelectedVariantId(variantId);
    const variant = product.variants.find((item) => item.id === variantId);
    setActiveImageId(variant?.gallery.length ? 'main' : `variant:${variantId}`);
  };

  const selectGalleryImage = (image: GalleryImage) => {
    setHasChosenImage(true);
    if (image.variantId) setSelectedVariantId(image.variantId);
    setActiveImageId(image.id);
  };

  const showGalleryImageByOffset = (offset: number) => {
    if (galleryImages.length <= 1) return;
    const nextIndex = (activeImageIndex + offset + galleryImages.length) % galleryImages.length;
    selectGalleryImage(galleryImages[nextIndex]);
  };

  // Close on Escape and support carousel arrow keys for keyboard accessibility.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isZoomOpen) setIsZoomOpen(false);
        else if (!isPage) onClose();
        return;
      }

      if (!hasCarousel || isZoomOpen) return;

      if (event.key === 'ArrowLeft') onPrevious();
      if (event.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    hasCarousel,
    isZoomOpen,
    onClose,
    onNext,
    onPrevious,
    isPage,
  ]);

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
    // Swipes inside a horizontally scrollable rail (variants, thumbnails)
    // scroll that rail and must not switch products.
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-swipe-ignore]')) {
      touchStart.current = null;
      return;
    }
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    const isHorizontalSwipe =
      Math.abs(horizontalDistance) >= 50 &&
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.25;

    if (!isHorizontalSwipe) return;
    if (!hasCarousel) return;
    if (horizontalDistance < 0) onNext();
    else onPrevious();
  };

  return (
    <div
      className={isPage ? 'w-full' : 'fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50'}
      onClick={isPage ? undefined : onClose}
      onTouchStartCapture={revealTouchControls}
      role={isPage ? undefined : 'dialog'}
      aria-modal={isPage ? undefined : true}
      aria-label={product.name}
    >
      {!isPage && <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        className="fixed right-3 top-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/75 text-cocoa shadow-lg backdrop-blur-md transition-opacity duration-200 hover:bg-white/95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:top-5"
        aria-label="Close product details"
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          ×
        </span>
      </button>}
      <div
        className={isPage
          ? 'touch-pan-y grid min-w-0 w-full overflow-hidden rounded-2xl bg-white shadow-sm md:grid-cols-2 md:items-start'
          : 'touch-pan-y bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-x-hidden overflow-y-auto shadow-xl'}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {/* Whole photo (watermark in its real corner) over a blurred copy of itself. */}
        <div className={isPage ? 'min-w-0 md:sticky md:top-4' : ''}>
        <div className="bg-cream">
          <div className={`relative mx-auto w-full overflow-hidden ${isPage ? '' : 'max-w-[55vh]'}`}>
            <img
              src={getProductImageUrl(activeImage, 960)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl"
              {...productImageProtection}
            />
            <button
              type="button"
              onClick={openImageZoom}
              className="relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cocoa focus-visible:ring-offset-2"
              aria-label="Open zoomed product image"
            >
              <img
                src={getProductImageUrl(activeImage, 960)}
                alt={
                  selectedVariant && product.variants.length > 1
                    ? `${product.name} — ${selectedVariant.name}`
                    : product.name
                }
                className="block aspect-square w-full object-contain"
                {...productImageProtection}
              />
            </button>
            {/* Bottom-left keeps the bottom-right photo watermark visible. */}
            <div className="absolute bottom-3 left-3 flex gap-2">
              <button
                type="button"
                onClick={openImageZoom}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/35 text-white shadow-md backdrop-blur-md transition-colors hover:bg-black/55"
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
            </div>
            {isNew && (
              <span
                className="badge-glow absolute left-3 top-3 rounded-full bg-mustard px-3 py-1 text-xs font-bold text-cocoa shadow-md"
                style={{ '--badge-glow-color': 'rgb(93 64 55 / 0.55)' } as CSSProperties}
              >
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
        </div>
        {hasAngleThumbnails && galleryImages.length > 1 && (
          <div
            data-swipe-ignore
            className="flex gap-2 overflow-x-auto border-b border-mustard/20 bg-cream/40 p-3"
            aria-label="Product image angles"
          >
            {galleryImages.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectGalleryImage(item)}
                aria-pressed={item.id === activeImageId}
                aria-label={index === 0 ? 'Show main product image' : `Show product image ${index + 1}`}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  item.id === activeImageId
                    ? 'border-cocoa'
                    : 'border-mustard/30 hover:border-mustard'
                }`}
              >
                <img src={getProductImageUrl(item.image, 160)} alt="" className="h-full w-full object-cover" {...productImageProtection} />
              </button>
            ))}
          </div>
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
              <div data-swipe-ignore className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {product.variants.map((variant) => {
                  const isSelected = variant.id === selectedVariant?.id;
                  const cartQuantity = getCartQuantity?.(product.id, variant.id) ?? 0;
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
                        selectVariant(variant.id);
                      }}
                      aria-pressed={isSelected}
                      className={`relative min-w-[5.5rem] rounded-xl border-2 p-1.5 text-left transition-colors ${
                        isSelected
                          ? 'border-cocoa bg-mustard/20'
                          : 'border-mustard/30 bg-white hover:border-mustard'
                      }`}
                    >
                      <img
                        src={getProductImageUrl(variant.image, 160)}
                        alt=""
                        className="aspect-square w-full rounded-lg bg-cream object-cover"
                        {...productImageProtection}
                      />
                      {cartQuantity > 0 && (
                        <span
                          className="absolute right-0 top-0 flex h-6 min-w-6 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full border-2 border-white bg-mustard px-1 text-xs font-extrabold text-cocoa shadow-md"
                          aria-label={`${cartQuantity} of ${variant.name} in cart`}
                        >
                          {cartQuantity > 99 ? '99+' : cartQuantity}
                        </span>
                      )}
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
          {isPage
            ? <h1 className="font-heading text-2xl font-semibold text-cocoa mt-1 sm:text-3xl">{product.name}</h1>
            : <h2 className="font-heading text-2xl font-semibold text-cocoa mt-1">{product.name}</h2>}
          {displayedPrice !== null && (
            <p className="mt-2 font-heading text-2xl font-bold text-cocoa">
              {formatINR(displayedPrice)}
            </p>
          )}
          <p className="text-cocoa/80 mt-3">{product.description}</p>
          <ProductDetails product={product} />
          {!isPage && (
            <a
              href={`${toProductPageUrl(product)}${selectedVariant ? `?variant=${encodeURIComponent(selectedVariant.id)}` : ''}`}
              onClick={(event) => {
                if (!onOpenFullDetails || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenFullDetails(selectedVariant?.id ?? '');
              }}
              className="mt-3 inline-block py-2 text-sm font-semibold text-cocoa underline underline-offset-4"
            >
              View full details
            </a>
          )}
          {/* Pinned to the bottom of the modal's scrollport so the buy and
              share actions stay reachable on short viewports, where the
              image plus variant picker can otherwise push them below the
              fold (phone browser URL bars make this worse). */}
          <div className="sticky bottom-0 z-30 -mx-4 mt-4 flex flex-col gap-2 border-t border-mustard/25 bg-white/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
            <div className="flex items-center justify-between gap-2">
            <span className={selectedVariant?.inStock ? 'font-medium text-green-700' : 'font-medium text-cocoa/60'}>
              {selectedVariant?.inStock ? 'In stock' : 'Sold out'}
            </span>
              <button
                type="button"
                onClick={() => {
                  setIsShareOpen((current) => !current);
                  setShareFeedback(null);
                }}
                aria-label="Share this product"
                aria-expanded={isShareOpen}
                aria-controls="product-share-options"
                title="Share this product"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isShareOpen
                    ? 'border-cocoa bg-cocoa text-cream'
                    : 'border-mustard bg-white text-cocoa hover:bg-mustard/20'
                }`}
              >
                <ShareIcon />
              </button>
            </div>
            <div className={`grid items-center gap-2 ${
              selectedCartItem && onUpdateCartItem && onRemoveCartItem
                ? 'grid-cols-1 justify-items-end sm:grid-cols-[minmax(0,1fr)_auto]'
                : 'grid-cols-[minmax(0,1fr)_auto]'
            }`}>
              <a
                href={whatsappOrderLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openWhatsAppOrder}
                className="flex h-12 w-full min-w-0 items-center justify-center gap-1 rounded-full bg-[#25D366] px-2 text-white shadow-sm transition-colors hover:bg-[#1ebe5d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
                aria-label="Quick order on WhatsApp"
                title="Quick order on WhatsApp"
              >
                <WhatsAppIcon />
                <span className="text-xs font-semibold leading-tight">Order on WhatsApp</span>
              </a>
              {selectedCartItem && onUpdateCartItem && onRemoveCartItem ? (
                <ProductQuantityControl
                  productName={product.name}
                  variantName={
                    product.variants.length > 1 ? selectedVariant.name : undefined
                  }
                  quantity={selectedCartItem.quantity}
                  disabled={isCartBusy}
                  onDecrease={() => {
                    void onUpdateCartItem(selectedCartItem.id, selectedCartItem.quantity - 1);
                  }}
                  onIncrease={() => {
                    if (!onAddToCart) return;
                    void onAddToCart(product, selectedVariant);
                  }}
                  onRemove={() => {
                    void onRemoveCartItem(selectedCartItem.id);
                  }}
                  overlay={false}
                />
              ) : onAddToCart && selectedVariant?.inStock ? (
                <CartIconButton
                  productName={product.name}
                  status={cartStatus}
                  onClick={() => {
                    setCartStatus('busy');
                    void onAddToCart(product, selectedVariant).then((added) => {
                      setCartStatus(added ? 'added' : 'error');
                      window.setTimeout(() => setCartStatus('idle'), 1800);
                    });
                  }}
                  disabled={isCartBusy}
                  quantity={getCartQuantity?.(product.id, selectedVariant.id) ?? 0}
                  overlay={false}
                  showLabel
                />
              ) : null}
            </div>
          </div>
          {isShareOpen && (
            <div
              id="product-share-options"
              ref={sharePanelRef}
              className="mt-4 rounded-xl border border-mustard/30 bg-cream/50 p-3"
            >
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => shareNatively()}
                    aria-label="Share to apps"
                    title="Share to apps"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-cocoa text-cream"
                  >
                    <ShareIcon />
                  </button>
                  <a
                    href={shareDetails.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent('share_product', {
                        method: 'whatsapp',
                        product_id: product.id,
                        variant_id: selectedVariant?.id,
                      })
                    }
                    aria-label="Share on WhatsApp"
                    title="WhatsApp"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white"
                  >
                    <WhatsAppIcon />
                  </a>
                  <a
                    href={shareDetails.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent('share_product', {
                        method: 'facebook',
                        product_id: product.id,
                        variant_id: selectedVariant?.id,
                      })
                    }
                    aria-label="Share on Facebook"
                    title="Facebook"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1877F2] text-white"
                  >
                    <FacebookIcon />
                  </a>
                  <button
                    type="button"
                    onClick={() => shareNatively('instagram')}
                    aria-label="Share on Instagram"
                    title="Instagram"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FCAF45] text-white"
                  >
                    <InstagramIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => shareNatively('snapchat')}
                    aria-label="Share on Snapchat"
                    title="Snapchat"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFFC00] text-black"
                  >
                    <SnapchatIcon />
                  </button>
                  <a
                    href={shareDetails.redditUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent('share_product', {
                        method: 'reddit',
                        product_id: product.id,
                        variant_id: selectedVariant?.id,
                      })
                    }
                    aria-label="Share on Reddit"
                    title="Reddit"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4500] text-white"
                  >
                    <RedditIcon />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    aria-label="Copy product link"
                    title="Copy link"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-cocoa/30 bg-white text-cocoa"
                  >
                    <CopyIcon />
                  </button>
                </div>
                <p className="mt-2 text-xs text-cocoa/60">
                  Instagram and Snapchat open your device share menu with the product photo
                  attached where supported. Those apps often drop the link text, so it's
                  also copied to your clipboard to paste in.
                </p>
                {shareFeedback && (
                  <p className="mt-2 text-xs font-semibold text-cocoa" role="status">
                    {shareFeedback}
                  </p>
                )}
            </div>
          )}
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
        </div>
      </div>
      {isZoomOpen && (
        <ImageZoomViewer
          image={getProductImageUrl(activeImage, 1600)}
          alt={
            selectedVariant && product.variants.length > 1
              ? `${product.name} — ${selectedVariant.name}`
              : product.name
          }
          onClose={() => setIsZoomOpen(false)}
          hasMultipleImages={galleryImages.length > 1}
          preloadImages={
            galleryImages.length > 1
              ? [1, -1].map((step) =>
                  getProductImageUrl(
                    galleryImages[(activeImageIndex + step + galleryImages.length) % galleryImages.length].image,
                    1600,
                  ),
                )
              : []
          }
          onPreviousImage={() => showGalleryImageByOffset(-1)}
          onNextImage={() => showGalleryImageByOffset(1)}
        />
      )}
    </div>
  );
}
