import { useEffect, useMemo, useRef, useState } from 'react';
import { trackCartStep } from '../services/analytics';
import type { Cart } from '../types/cart';
import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getCartWhatsAppLink, getCheckoutSupportWhatsAppLink } from '../utils/whatsapp';
import { getCartEmailLink, getCartEmailText, getCartGmailLink, ORDERS_EMAIL } from '../utils/email';
import { MailIcon, WhatsAppIcon } from './SocialIcons';
import CartDeliveryPin from './CartDeliveryPin';
import RazorpayCheckout from './RazorpayCheckout';
import { fetchLiveCheckoutEnabled } from '../services/checkout';
import CustomerFunnel from './CustomerFunnel';
import type { DeliveryDetails, WelcomeOffer } from '../types/customer';
import { fetchWelcomeOffer } from '../services/customer';
import { normalizeMinimumOrderQuantity } from '../utils/minimumOrderQuantity';
import { FREE_SHIPPING_THRESHOLD, getCartTotals, getFreeDeliveryShortfall, getShippingLabel } from '../utils/cartMessage';

interface Props {
  accountName?: string | null;
  onCreateAccount?: () => void;
  pageStep?: 'cart' | 'delivery' | 'review' | 'confirmation';
  onNavigateStep?: (step: 'cart' | 'delivery' | 'review' | 'confirmation', requestId?: string) => void;
  confirmationRequest?: string;
  onSaveDeliveryDetails?: (value: DeliveryDetails) => Promise<Cart | null>;
  onSelectWelcomeCoupon?: (code: string) => Promise<Cart | null>;
  onSaveDeliveryPin: (value: string) => Promise<Cart | null>;
  cart: Cart | null;
  products: Product[];
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, quantity: number, minimumQuantity?: number) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onWhatsAppStarted: () => void;
  onEmailStarted: () => void;
  onOpenProduct: (productId: string, variantId: string) => void;
}

export default function CartDrawer({
  cart,
  products,
  isLoading,
  isBusy,
  error,
  onClose,
  onUpdateQuantity,
  onRemove,
  onClear,
  onWhatsAppStarted,
  onEmailStarted,
  onOpenProduct,
  onSaveDeliveryPin,
  onSaveDeliveryDetails,
  onSelectWelcomeCoupon,
  pageStep,
  onNavigateStep,
  confirmationRequest,
  accountName,
  onCreateAccount,
}: Props) {
  const isPage = Boolean(pageStep);
  const [paidCart, setPaidCart] = useState<Cart | null>(null);
  // Desktop browsers with no mail client registered silently ignore mailto:
  // links, so reveal webmail and copy fallbacks once Email has been tried.
  const [hasTriedEmail, setHasTriedEmail] = useState(false);
  const [liveCheckout, setLiveCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [welcomeOffer, setWelcomeOffer] = useState<WelcomeOffer | null>(null);
  const [welcomeError, setWelcomeError] = useState('');
  const canCreateAccount = Boolean(onCreateAccount);
  useEffect(() => {
    if (!isPage || !canCreateAccount || accountName) return;
    let current = true;
    void fetchWelcomeOffer().then(offer => { if (current) { setWelcomeOffer(offer); setWelcomeError(''); } })
      .catch(failure => { if (current) { setWelcomeOffer(null); setWelcomeError(failure instanceof Error ? failure.message : 'Unable to load the welcome discount.'); } });
    return () => { current = false; };
  }, [isPage, canCreateAccount, accountName]);
  useEffect(() => {
    let current = true;
    void fetchLiveCheckoutEnabled().then(value => { if (current) setLiveCheckout(value); })
      .catch(failure => { if (current) setCheckoutError(failure instanceof Error ? failure.message : 'Unable to check online payments.'); });
    return () => { current = false; };
  }, []);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const checkoutCart = useMemo(
    () =>
      pageStep === 'confirmation' && paidCart ? paidCart : cart
        ? {
            ...cart,
            items: cart.items.map((item) => {
              const product = products.find((candidate) => candidate.id === item.productId);
              const variant = product?.variants.find(
                (candidate) => candidate.id === item.variantId,
              );
              if (!product || !variant) return item;
              return {
                ...item,
                productName: product.name,
                variantName: product.variants.length > 1 ? variant.name : '',
                image: variant.image,
                unitPrice: getPublicVariantPrice(product, variant),
              };
            }),
          }
        : null,
    [cart, products, pageStep, paidCart],
  );
  const unavailableItemIds = useMemo(
    () =>
      new Set(
        (cart?.items ?? [])
          .filter((item) => {
            const product = products.find((candidate) => candidate.id === item.productId);
            const variant = product?.variants.find(
              (candidate) => candidate.id === item.variantId,
            );
            return !product || !variant || !variant.inStock || item.quantity > variant.availableQuantity;
          })
          .map((item) => item.id),
      ),
    [cart, products],
  );
  const belowMinimumItemIds = useMemo(
    () =>
      new Set(
        (cart?.items ?? [])
          .filter((item) => {
            const product = products.find((candidate) => candidate.id === item.productId);
            return item.quantity < normalizeMinimumOrderQuantity(product?.minimumOrderQuantity);
          })
          .map((item) => item.id),
      ),
    [cart, products],
  );
  const totals = checkoutCart ? getCartTotals(checkoutCart) : null;
  const total = totals?.total ?? 0;
  const freeDeliveryShortfall = checkoutCart ? getFreeDeliveryShortfall(checkoutCart) : 0;
  const hasUnpricedItems =
    checkoutCart?.items.some((item) => item.unitPrice === null) ?? false;
  const viewedCart = useRef(false);
  useEffect(() => {
    if (pageStep && pageStep !== 'cart') { viewedCart.current = false; return; }
    if (isLoading || !checkoutCart || viewedCart.current) return;
    viewedCart.current = true;
    trackCartStep('view_cart', checkoutCart);
  }, [isLoading, checkoutCart, pageStep]);
  const checkoutEntered = useRef(false);
  useEffect(() => {
    if (pageStep !== 'delivery' && pageStep !== 'review') { checkoutEntered.current = false; return; }
    if (isLoading || !checkoutCart?.items.length || checkoutEntered.current) return;
    checkoutEntered.current = true;
    trackCartStep('begin_checkout', checkoutCart);
  }, [pageStep, isLoading, checkoutCart]);
  const whatsappLink =
    checkoutCart && checkoutCart.items.length > 0
      ? getCartWhatsAppLink(checkoutCart)
      : '#';
  const emailLink =
    checkoutCart && checkoutCart.items.length > 0
      ? getCartEmailLink(checkoutCart)
      : '#';
  const gmailLink =
    checkoutCart && checkoutCart.items.length > 0
      ? getCartGmailLink(checkoutCart)
      : '#';

  const copyOrderDetails = () => {
    if (!checkoutCart) return;
    navigator.clipboard
      ?.writeText(getCartEmailText(checkoutCart))
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  return (
    <div
      className={isPage ? 'w-full text-cocoa' : 'fixed inset-0 z-[80] bg-black/50'}
      role={isPage ? undefined : 'dialog'}
      aria-modal={isPage ? undefined : true}
      aria-label={isPage ? undefined : 'Shopping cart'}
      onClick={isPage ? undefined : onClose}
    >
      <aside
        className={isPage ? 'mx-auto flex w-full max-w-6xl flex-col bg-cream px-4 py-6 sm:py-10'
          : 'ml-auto flex h-full w-full max-w-md flex-col bg-cream shadow-2xl'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-mustard/30 bg-white px-4 py-2">
          <div>
            <h2 className="font-heading text-2xl font-bold text-cocoa">{pageStep === 'delivery' ? 'Delivery details'
              : pageStep === 'review' ? 'Review & payment' : pageStep === 'confirmation' ? 'Order confirmation' : 'Your cart'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cocoa/30 bg-cream text-2xl text-cocoa transition-colors hover:bg-mustard/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
            aria-label="Close cart"
          >
            {isPage ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m14 6-6 6 6 6" />
            </svg> : '×'}
          </button>
        </div>

        {isPage && <nav aria-label="Checkout steps" className="my-5">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['cart','delivery','review','confirmation'] as const).map((step, index) => <li key={step}>
              <button type="button" aria-current={pageStep === step ? 'step' : undefined}
                disabled={step === 'confirmation' || pageStep === 'confirmation' || isBusy
                  || (step !== 'cart' && !cart?.items.length)
                  || (step === 'review' && !cart?.deliveryDetails)}
                onClick={() => onNavigateStep?.(step)}
                className={`min-h-11 w-full rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${pageStep === step ? 'border-cocoa bg-cocoa text-cream' : 'border-mustard/40 bg-white text-cocoa'}`}>
                {index + 1}. {step === 'cart' ? 'Cart' : step === 'delivery' ? 'Delivery' : step === 'review' ? 'Review & pay' : 'Confirmation'}
              </button>
            </li>)}
          </ol>
        </nav>}
        {isPage && pageStep !== 'confirmation' && !accountName && onCreateAccount && welcomeOffer?.enabled && <section
          aria-label="Welcome discount" className="mb-6 rounded-2xl border-2 border-mustard bg-mustard/15 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5">
          <div>
            <h3 className="font-heading text-xl font-bold text-cocoa">Sign up and get an additional {welcomeOffer.percent}% off your first order!</h3>
            <p className="mt-1 text-sm text-cocoa">Up to {formatINR(welcomeOffer.maxDiscountRupees)} off on items worth {formatINR(welcomeOffer.minimumSubtotalRupees)} or more.</p>
            <p className="mt-2 text-xs text-cocoa/70">Activate your account and apply ILOVELUVIA at review. One-time welcome reward; valid for {welcomeOffer.validDays} days. Guest checkout remains available.</p>
          </div>
          <button type="button" disabled={isBusy} onClick={onCreateAccount}
            className="mt-3 min-h-11 shrink-0 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50 sm:mt-0">
            Create account &amp; save
          </button>
        </section>}
        {isPage && pageStep !== 'confirmation' && !accountName && welcomeError && <p role="alert" className="mb-4 text-sm text-red-700">{welcomeError}</p>}
        <div className={isPage ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]' : 'contents'}>
        <div className={isPage ? 'min-w-0 rounded-2xl border border-mustard/30 bg-white p-4 sm:p-6' : 'min-h-0 flex-1 overflow-y-auto p-4'}>
          {error && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {pageStep === 'confirmation' ? <div>
            <h3 className="font-heading text-2xl font-bold">{paidCart ? 'Thank you for choosing Luvia!' : 'Payment confirmation'}</h3>
            <p className="mt-3">{paidCart ? 'Your verified payment confirmation and Order ID are shown below. Your confirmation email is sent separately.'
              : 'An order is confirmed only after payment verification. If you have paid, do not pay again. Keep this page open while we check the saved checkout.'}</p>
            <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-full border border-cocoa px-5 py-2">Continue shopping</button>
          </div> : isLoading ? (
            <p className="py-12 text-center text-cocoa/60">Restoring your cart…</p>
          ) : !cart || cart.items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-heading text-xl font-bold text-cocoa">Your cart is empty</p>
              <p className="mt-2 text-sm text-cocoa/60">
                Add products and they will remain here for up to 30 days.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(!isPage || pageStep === 'cart' || pageStep === 'review') && checkoutCart?.items.map((item) => {
                const isUnavailable = unavailableItemIds.has(item.id);
                const isBelowMinimum = belowMinimumItemIds.has(item.id);
                const product = products.find((candidate) => candidate.id === item.productId);
                const variant = product?.variants.find(candidate => candidate.id === item.variantId);
                const availableQuantity = variant?.inStock ? variant.availableQuantity : 0;
                const minimumQuantity = normalizeMinimumOrderQuantity(product?.minimumOrderQuantity);
                const itemName = item.variantName
                  ? `${item.productName} — ${item.variantName}`
                  : item.productName;
                return (
                  <article
                    key={item.id}
                    onClick={() => onOpenProduct(item.productId, item.variantId)}
                    aria-label={`View ${itemName}`}
                    className="cursor-pointer rounded-2xl border border-mustard/30 bg-white p-3 transition-colors hover:border-mustard"
                  >
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenProduct(item.productId, item.variantId);
                        }}
                        className="shrink-0 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa"
                        aria-label={`View ${itemName}`}
                      >
                        <img
                          src={getProductImageUrl(item.image, 160)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-20 w-20 rounded-xl bg-cream object-cover"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenProduct(item.productId, item.variantId);
                          }}
                          className="text-left font-semibold text-cocoa underline-offset-2 hover:underline"
                        >
                          {item.productName}
                        </button>
                        {item.variantName && (
                          <p className="text-sm font-semibold text-cocoa/65">
                            Variant: {item.variantName}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-bold text-cocoa">
                          {item.unitPrice === null
                            ? 'Price on enquiry'
                            : formatINR(item.unitPrice)}
                        </p>
                        {isUnavailable && (
                          <p className="mt-1 text-xs font-semibold text-red-700">
                            {availableQuantity >= minimumQuantity
                              ? `Only ${availableQuantity} available. Reduce the quantity to continue.`
                              : availableQuantity > 0
                              ? `Only ${availableQuantity} available, below the minimum order. Remove this item to continue.`
                              : 'Currently unavailable — remove this item to continue.'}
                          </p>
                        )}
                        {isBelowMinimum && (
                          <p className="mt-1 text-xs font-semibold text-red-700">
                            Increase to the minimum order quantity before checkout.
                          </p>
                        )}
                      </div>
                    </div>
                    <div
                      className="mt-3 flex items-center justify-between"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, Math.min(item.quantity - 1, Math.max(minimumQuantity, availableQuantity)), minimumQuantity)}
                          disabled={isBusy || item.quantity <= minimumQuantity}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-mustard text-cocoa disabled:opacity-35"
                          aria-label={`Decrease quantity of ${itemName}`}
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center font-bold text-cocoa">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1, minimumQuantity)}
                          disabled={isBusy || item.quantity >= Math.min(99, availableQuantity)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-mustard text-cocoa disabled:opacity-35"
                          aria-label={`Increase quantity of ${itemName}`}
                        >
                          +
                        </button>
                      </div>
                      {minimumQuantity > 1 && (
                        <p className="text-xs font-medium text-cocoa/65">
                          Minimum order: {minimumQuantity} pieces
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        disabled={isBusy}
                        className="text-sm font-semibold text-red-700 underline disabled:opacity-50"
                        aria-label={`Remove ${itemName} from cart`}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
              <div hidden={isPage && pageStep !== 'cart'} className="flex items-center justify-between gap-3 text-xs">
                <button type="button" onClick={onClear} disabled={isBusy}
                  className="min-h-11 shrink-0 font-semibold text-red-700 underline disabled:opacity-50">
                  Clear cart
                </button>
                <span className="text-right text-cocoa/50">Cart saved for 30 days</span>
              </div>
              <details open hidden={isPage && pageStep === 'delivery'} className="rounded-xl border border-mustard/30 bg-white px-3 text-sm text-cocoa">
                <summary className="cursor-pointer py-3 font-semibold">Price breakdown</summary>
                <div className="space-y-1 pb-3">
                  <div className="flex items-center justify-between">
                    <span>{hasUnpricedItems ? 'Priced items subtotal' : 'Items subtotal'}</span>
                    <span>{formatINR(totals?.subtotal ?? 0)}</span>
                  </div>
                  {checkoutCart?.coupon && totals && (totals.discount > 0 ? (
                    <div className="flex items-center justify-between text-green-800">
                      <span>Coupon {checkoutCart.coupon.code} ({checkoutCart.coupon.percent}% off)</span>
                      <span>-{formatINR(totals.discount)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-cocoa/60">
                      Add {formatINR(totals.couponShortfall)} more in items to use coupon {checkoutCart.coupon.code}.
                    </p>
                  ))}                  <div className="flex items-center justify-between text-cocoa/75">
                    <span>{totals && checkoutCart ? getShippingLabel(checkoutCart, totals) : 'Indicative shipping'}</span>
                    <span>{totals?.shipping === 0 ? 'Free' : formatINR(totals?.shipping ?? 0)}</span>
                  </div>
                  {totals && totals.subtotal - totals.discount < FREE_SHIPPING_THRESHOLD && (
                    <p className="text-xs text-cocoa/60">
                      Free shipping on items worth {formatINR(FREE_SHIPPING_THRESHOLD)} or more after coupon discounts.
                    </p>
                  )}
                  <p className="text-xs text-cocoa/60">
                    {isPage && !cart.deliveryDetails ? 'Save or select your delivery address to calculate shipping. The current shipping amount is an estimate.'
                      : liveCheckout ? 'Shipping shown here is included in the online payment total.'
                      : 'Shipping is indicative and the final delivery charge will be confirmed by Luvia.'}
                    {hasUnpricedItems ? ' *Items with no listed price are not included in this estimate.' : ''}
                  </p>
                </div>
              </details>
              {!isPage && <CartDeliveryPin key={cart.id} cart={cart} busy={isBusy} onSave={onSaveDeliveryPin} />}
              {(!isPage || pageStep === 'delivery' || pageStep === 'review') && onSaveDeliveryDetails && onSelectWelcomeCoupon && <CustomerFunnel key={`details-${cart.id}-${pageStep ?? ''}`}
                pageStep={pageStep === 'delivery' || pageStep === 'review' ? pageStep : undefined}
                onReview={() => onNavigateStep?.('review')}
                onEdit={isPage ? () => onNavigateStep?.('delivery') : undefined}
                onBack={isPage ? () => onNavigateStep?.('cart') : undefined}
                cart={checkoutCart ?? cart} busy={isBusy} onSave={onSaveDeliveryDetails} onCoupon={onSelectWelcomeCoupon} onlineCheckout={liveCheckout} />}
              {pageStep === 'cart' && <button type="button" disabled={isBusy || unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0}
                onClick={() => onNavigateStep?.('delivery')} className="min-h-11 w-full rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50">
                Continue with delivery details
              </button>}
              {pageStep === 'cart' && <p className="text-center text-xs text-cocoa/65">Guest orders do not receive the one-time welcome reward. Sign in to use your account.</p>}
            </div>
          )}
        </div>

        {(cart && (cart.items.length > 0 || pageStep === 'confirmation') || paidCart) && (
          <div aria-label="Cart order actions" className={isPage ? 'h-fit min-w-0 rounded-2xl border border-mustard/30 bg-white p-5 lg:sticky lg:top-6'
            : 'max-h-[40%] shrink-0 overflow-y-auto border-t border-mustard/30 bg-white px-4 py-3'}>
            <div hidden={pageStep === 'confirmation' && !paidCart} className="flex items-center justify-between gap-3 font-bold text-cocoa">
              <span>{hasUnpricedItems ? 'Estimated total*' : liveCheckout && cart?.deliveryDetails ? 'Total' : 'Estimated total'}</span>
              {totals?.discount ? (
                <span className="flex items-baseline gap-2">
                  <s className="text-sm font-normal text-cocoa/50" aria-label={`Original price ${formatINR(total + totals.discount)}`}>
                    {formatINR(total + totals.discount)}
                  </s>
                  <span className="text-green-800" aria-label={`Discounted price ${formatINR(total)}`}>{formatINR(total)}</span>
                </span>
              ) : <span>{formatINR(total)}</span>}
            </div>
            <p hidden={pageStep === 'confirmation' && !paidCart} className="text-xs text-cocoa/60">
              {totals?.discount ? `Coupon saves ${formatINR(totals.discount)} · ` : ''}{totals?.shipping === 0 ? 'Free shipping' : liveCheckout && cart?.deliveryDetails ? 'Includes shipping' : 'Includes estimated shipping'}
              {hasUnpricedItems ? ' · Unpriced items excluded' : ''}
            </p>
            {pageStep !== 'confirmation' && totals?.hasCompletePricing && <section aria-label="Free delivery" className="mt-4 rounded-xl border border-mustard/40 bg-cream p-3 text-sm">
              {freeDeliveryShortfall > 0 ? <>
                <p className="font-semibold">Add {formatINR(freeDeliveryShortfall)} more in items for free delivery!</p>
                <p className="mt-1 text-xs text-cocoa/70">Free delivery on items worth {formatINR(FREE_SHIPPING_THRESHOLD)} or more after coupon discounts. Shipping fees do not count.</p>
                <div
                  role="progressbar"
                  aria-label="Progress towards free shipping"
                  aria-valuemin={0}
                  aria-valuemax={FREE_SHIPPING_THRESHOLD}
                  aria-valuenow={Math.min(FREE_SHIPPING_THRESHOLD, Math.max(0, totals.subtotal - totals.discount))}
                  aria-valuetext={`${formatINR(Math.min(FREE_SHIPPING_THRESHOLD, Math.max(0, totals.subtotal - totals.discount)))} of ${formatINR(FREE_SHIPPING_THRESHOLD)} after coupon discounts`}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-mustard/25"
                >
                  <span
                    aria-hidden="true"
                    className="block h-full rounded-full bg-cocoa transition-[width]"
                    style={{ width: `${Math.min(100, Math.max(0, ((totals.subtotal - totals.discount) / FREE_SHIPPING_THRESHOLD) * 100))}%` }}
                  />
                </div>
                <button type="button" disabled={isBusy} onClick={onClose}
                  className="mt-2 min-h-11 font-semibold underline underline-offset-2 disabled:opacity-50">Add more items</button>
              </> : <p className="font-semibold text-green-800">You&apos;ve unlocked free delivery!</p>}
            </section>}
            {isPage && pageStep !== 'confirmation' && !cart?.deliveryDetails && <p className="mt-3 text-xs text-cocoa/70">
              Save or select your delivery address in the next step to calculate shipping.
            </p>}
            {checkoutError && <p role="alert" className="mt-2 text-xs text-red-700">{checkoutError}</p>}
            <div hidden={liveCheckout && isPage && pageStep !== 'review' && pageStep !== 'confirmation'}>
            {liveCheckout && checkoutCart && <RazorpayCheckout key={`live-${checkoutCart.id}`} cart={checkoutCart} live
              confirmationOnly={pageStep === 'confirmation'}
              confirmationRequest={confirmationRequest}
              onConfirmed={(requestId, purchasedCart) => { if (isPage && pageStep !== 'confirmation') {
                setPaidCart(purchasedCart.items.length ? purchasedCart : null); onNavigateStep?.('confirmation', requestId);
              } }}
              disabled={pageStep === 'confirmation' || isBusy || !checkoutCart.deliveryDetails || !checkoutCart.deliveryDetails.email?.trim() || hasUnpricedItems || unavailableItemIds.size > 0
                || belowMinimumItemIds.size > 0 || Boolean(totals?.couponShortfall)} />}
            {!liveCheckout && pageStep !== 'confirmation' && <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href={unavailableItemIds.size === 0 && belowMinimumItemIds.size === 0 ? whatsappLink : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy) {
                    event.preventDefault();
                    return;
                  }
                  onWhatsAppStarted();
                }}
                aria-disabled={unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy}
                aria-label="Send cart to Luvia on WhatsApp"
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-white ${
                  unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy
                    ? 'cursor-not-allowed bg-gray-400'
                    : 'bg-[#25D366] hover:bg-[#1ebe5d]'
                }`}
              >
                <WhatsAppIcon />
                WhatsApp
              </a>
              <a
                href={unavailableItemIds.size === 0 && belowMinimumItemIds.size === 0 ? emailLink : undefined}
                onClick={(event) => {
                  if (unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy) {
                    event.preventDefault();
                    return;
                  }
                  setHasTriedEmail(true);
                  setCopyState('idle');
                  onEmailStarted();
                }}
                aria-disabled={unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy}
                aria-label={`Email cart to Luvia at ${ORDERS_EMAIL}`}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 py-2 text-sm font-semibold ${
                  unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0 || isBusy
                    ? 'cursor-not-allowed border-gray-300 text-gray-400'
                    : 'border-cocoa text-cocoa hover:bg-cocoa hover:text-white'
                }`}
              >
                <MailIcon />
                Email
              </a>
            </div>}
            {liveCheckout && checkoutCart && <a href={getCheckoutSupportWhatsAppLink()} target="_blank" rel="noopener noreferrer"
              className="mt-2 block text-center text-xs underline">Need help? Contact Luvia on WhatsApp</a>}
            {!liveCheckout && hasTriedEmail && unavailableItemIds.size === 0 && belowMinimumItemIds.size === 0 && (
              <div className="mt-2 rounded-xl border border-mustard/50 bg-mustard/10 px-3 py-2 text-xs text-cocoa">
                <p className="font-semibold">Mail app didn&apos;t open?</p>
                <p className="mt-0.5 text-cocoa/70">
                  Use Gmail instead, or copy the order and send it to {ORDERS_EMAIL}.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={gmailLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onEmailStarted()}
                    className="rounded-full border-2 border-cocoa px-3 py-1 font-semibold text-cocoa hover:bg-cocoa hover:text-white"
                  >
                    Open in Gmail
                  </a>
                  <button
                    type="button"
                    onClick={copyOrderDetails}
                    className="rounded-full border-2 border-cocoa px-3 py-1 font-semibold text-cocoa hover:bg-cocoa hover:text-white"
                  >
                    {copyState === 'copied' ? 'Copied!' : 'Copy order details'}
                  </button>
                </div>
                {copyState === 'failed' && (
                  <p className="mt-1 text-red-700">
                    Copying failed — please select the items above manually.
                  </p>
                )}
              </div>
            )}
            {!liveCheckout && checkoutCart && import.meta.env.VITE_ENABLE_RAZORPAY_TEST_CHECKOUT === 'true' && (
              <RazorpayCheckout key={checkoutCart.id} cart={checkoutCart}
                disabled={isBusy || hasUnpricedItems || unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0} />
            )}
            </div>
          </div>
        )}
        </div>
      </aside>
    </div>
  );
}
