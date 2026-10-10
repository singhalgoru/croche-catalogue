import { useMemo, useState } from 'react';
import type { Cart } from '../types/cart';
import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getCartWhatsAppLink } from '../utils/whatsapp';
import { getCartEmailLink, getCartEmailText, getCartGmailLink, ORDERS_EMAIL } from '../utils/email';
import { MailIcon, WhatsAppIcon } from './SocialIcons';
import CartDeliveryPin from './CartDeliveryPin';
import RazorpayCheckout from './RazorpayCheckout';
import CustomerFunnel from './CustomerFunnel';
import type { DeliveryDetails } from '../types/customer';
import { normalizeMinimumOrderQuantity } from '../utils/minimumOrderQuantity';
import { FREE_SHIPPING_THRESHOLD, getCartTotals, getShippingLabel } from '../utils/cartMessage';

interface Props {
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
}: Props) {
  // Desktop browsers with no mail client registered silently ignore mailto:
  // links, so reveal webmail and copy fallbacks once Email has been tried.
  const [hasTriedEmail, setHasTriedEmail] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const checkoutCart = useMemo(
    () =>
      cart
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
    [cart, products],
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
            return !product || !variant || !variant.inStock;
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
  const hasUnpricedItems =
    checkoutCart?.items.some((item) => item.unitPrice === null) ?? false;
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
      className="fixed inset-0 z-[80] bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
      onClick={onClose}
    >
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col bg-cream shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-mustard/30 bg-white px-4 py-2">
          <div>
            <h2 className="font-heading text-2xl font-bold text-cocoa">Your cart</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cocoa/20 text-2xl text-cocoa"
            aria-label="Close cart"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {isLoading ? (
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
              {checkoutCart?.items.map((item) => {
                const isUnavailable = unavailableItemIds.has(item.id);
                const isBelowMinimum = belowMinimumItemIds.has(item.id);
                const product = products.find((candidate) => candidate.id === item.productId);
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
                            Currently unavailable — remove this item to continue.
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
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1, minimumQuantity)}
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
                          disabled={isBusy || item.quantity >= 99}
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
              <div className="flex items-center justify-between gap-3 text-xs">
                <button type="button" onClick={onClear} disabled={isBusy}
                  className="min-h-11 shrink-0 font-semibold text-red-700 underline disabled:opacity-50">
                  Clear cart
                </button>
                <span className="text-right text-cocoa/50">Cart saved for 30 days</span>
              </div>
              <details className="rounded-xl border border-mustard/30 bg-white px-3 text-sm text-cocoa">
                <summary className="cursor-pointer py-3 font-semibold">Price breakdown</summary>
                <div className="space-y-1 pb-3">
                  <div className="flex items-center justify-between">
                    <span>{hasUnpricedItems ? 'Priced items subtotal' : 'Items subtotal'}</span>
                    <span>{formatINR(totals?.subtotal ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-cocoa/75">
                    <span>{totals && checkoutCart ? getShippingLabel(checkoutCart, totals) : 'Indicative shipping'}</span>
                    <span>{totals?.shipping === 0 ? 'Free' : formatINR(totals?.shipping ?? 0)}</span>
                  </div>
                  {totals && totals.subtotal < FREE_SHIPPING_THRESHOLD && (
                    <p className="text-xs text-cocoa/60">
                      Add {formatINR(FREE_SHIPPING_THRESHOLD - totals.subtotal)} more in items for free shipping at {formatINR(FREE_SHIPPING_THRESHOLD)}.
                    </p>
                  )}
                  <p className="text-xs text-cocoa/60">
                    Shipping is indicative and the final delivery charge will be confirmed by Luvia.
                    {hasUnpricedItems ? ' *Items with no listed price are not included in this estimate.' : ''}
                  </p>
                </div>
              </details>
              <CartDeliveryPin key={cart.id} cart={cart} busy={isBusy} onSave={onSaveDeliveryPin} />
              {onSaveDeliveryDetails && onSelectWelcomeCoupon && <CustomerFunnel key={`details-${cart.id}`}
                cart={cart} busy={isBusy} onSave={onSaveDeliveryDetails} onCoupon={onSelectWelcomeCoupon} />}
            </div>
          )}
        </div>

        {cart && cart.items.length > 0 && (
          <div aria-label="Cart order actions" className="max-h-[40%] shrink-0 overflow-y-auto border-t border-mustard/30 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3 font-bold text-cocoa">
              <span>{hasUnpricedItems ? 'Estimated total*' : 'Estimated total'}</span>
              <span>{formatINR(total)}</span>
            </div>
            <p className="text-xs text-cocoa/60">
              {totals?.shipping === 0 ? 'Free shipping' : 'Includes estimated shipping'} · Final amount confirmed by Luvia
              {hasUnpricedItems ? ' · Unpriced items excluded' : ''}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
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
            </div>
            {hasTriedEmail && unavailableItemIds.size === 0 && belowMinimumItemIds.size === 0 && (
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
            {checkoutCart && import.meta.env.VITE_ENABLE_RAZORPAY_TEST_CHECKOUT === 'true' && (
              <RazorpayCheckout key={checkoutCart.id} cart={checkoutCart}
                disabled={isBusy || hasUnpricedItems || unavailableItemIds.size > 0 || belowMinimumItemIds.size > 0} />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
