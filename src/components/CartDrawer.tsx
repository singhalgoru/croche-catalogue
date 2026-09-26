import { useMemo } from 'react';
import type { Cart } from '../types/cart';
import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { getCartWhatsAppLink } from '../utils/whatsapp';
import { WhatsAppIcon } from './SocialIcons';

interface Props {
  cart: Cart | null;
  products: Product[];
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onWhatsAppStarted: () => void;
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
  onOpenProduct,
}: Props) {
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
                variantName: variant.name,
                image: variant.image,
                unitPrice: product.showPrice ? product.price : null,
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
  const total = (checkoutCart?.items ?? []).reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
    0,
  );
  const hasUnpricedItems =
    checkoutCart?.items.some((item) => item.unitPrice === null) ?? false;
  const whatsappLink =
    checkoutCart && checkoutCart.items.length > 0
      ? getCartWhatsAppLink(checkoutCart)
      : '#';

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
        <div className="flex items-center justify-between border-b border-mustard/30 bg-white p-4">
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

        <div className="flex-1 overflow-y-auto p-4">
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
                return (
                  <article
                    key={item.id}
                    onClick={() => onOpenProduct(item.productId, item.variantId)}
                    aria-label={`View ${item.productName} — ${item.variantName}`}
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
                        aria-label={`View ${item.productName} — ${item.variantName}`}
                      >
                        <img
                          src={item.image}
                          alt=""
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
                        <p className="text-sm font-semibold text-cocoa/65">
                          Variant: {item.variantName}
                        </p>
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
                      </div>
                    </div>
                    <div
                      className="mt-3 flex items-center justify-between"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={isBusy || item.quantity <= 1}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-mustard text-cocoa disabled:opacity-35"
                          aria-label={`Decrease quantity of ${item.productName} — ${item.variantName}`}
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center font-bold text-cocoa">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={isBusy || item.quantity >= 99}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-mustard text-cocoa disabled:opacity-35"
                          aria-label={`Increase quantity of ${item.productName} — ${item.variantName}`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        disabled={isBusy}
                        className="text-sm font-semibold text-red-700 underline disabled:opacity-50"
                        aria-label={`Remove ${item.productName} — ${item.variantName} from cart`}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {cart && cart.items.length > 0 && (
          <div className="border-t border-mustard/30 bg-white p-4">
            <div className="flex items-center justify-between font-bold text-cocoa">
              <span>{hasUnpricedItems ? 'Priced items total' : 'Estimated total'}</span>
              <span>{formatINR(total)}</span>
            </div>
            <a
              href={unavailableItemIds.size === 0 ? whatsappLink : undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (unavailableItemIds.size > 0) {
                  event.preventDefault();
                  return;
                }
                onWhatsAppStarted();
              }}
              aria-disabled={unavailableItemIds.size > 0 || isBusy}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 font-semibold text-white ${
                unavailableItemIds.size > 0 || isBusy
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-[#25D366] hover:bg-[#1ebe5d]'
              }`}
            >
              <WhatsAppIcon />
              Enquire about cart on WhatsApp
            </a>
            <button
              type="button"
              onClick={onClear}
              disabled={isBusy}
              className="mt-3 w-full text-sm font-semibold text-red-700 underline disabled:opacity-50"
            >
              Clear cart
            </button>
            <p className="mt-3 text-center text-xs text-cocoa/50">
              Your anonymous cart is saved for up to 30 days on this browser.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
