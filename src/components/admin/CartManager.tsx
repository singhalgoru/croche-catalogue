import { useCallback, useEffect, useState } from 'react';
import { fetchAdminCarts } from '../../services/cart';
import type { AdminCart } from '../../types/cart';
import { formatINR } from '../../utils/currency';

export default function CartManager() {
  const [carts, setCarts] = useState<AdminCart[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCarts = useCallback(async () => {
    setIsLoading(true);
    try {
      setCarts(await fetchAdminCarts());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load customer carts.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadCarts());
  }, [loadCarts]);

  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-controls="cart-activity-content"
          className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
        >
          <span>
            <span className="block font-heading text-2xl font-bold text-cocoa">
              Anonymous cart activity
            </span>
            <span className="mt-1 block text-sm text-cocoa/65">
              {carts.length} active cart{carts.length === 1 ? '' : 's'} from the last 30 days
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard/20 text-xl text-cocoa transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            ⌄
          </span>
        </button>
        <button
          type="button"
          onClick={() => void loadCarts()}
          disabled={isLoading}
          className="rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div id="cart-activity-content" hidden={!isExpanded}>
        <p className="mt-4 text-sm text-cocoa/65">
          These are anonymous product interests, not completed orders. Customer contact details are
          not collected here.
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!isLoading && !error && carts.length === 0 && (
          <p className="mt-5 rounded-xl bg-cream/60 p-4 text-sm text-cocoa/65">
            No active customer carts yet.
          </p>
        )}
        <div className="mt-5 space-y-4">
          {carts.map((cart) => {
            const total = cart.items.reduce(
              (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
              0,
            );
            const hasUnpricedItems = cart.items.some((item) => item.unitPrice === null);
            return (
              <article key={cart.id} className="rounded-2xl border border-mustard/30 bg-cream/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-cocoa">{cart.reference}</h3>
                    <p className="text-xs text-cocoa/55">
                      Last activity {new Date(cart.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      cart.status === 'whatsapp_started'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-mustard/20 text-cocoa'
                    }`}
                  >
                    {cart.status === 'whatsapp_started' ? 'WhatsApp opened' : 'Active'}
                  </span>
                </div>
                {cart.items.length === 0 ? (
                  <p className="mt-3 text-sm text-cocoa/55">This cart is empty.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-mustard/20">
                    {cart.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-cocoa">
                            {item.productName}
                          </p>
                          <p className="text-xs text-cocoa/60">
                            {item.variantName} · Qty {item.quantity}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-cocoa">
                          {item.unitPrice === null
                            ? 'Enquire'
                            : formatINR(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {cart.items.length > 0 && (
                  <p className="mt-2 text-right text-sm font-bold text-cocoa">
                    {hasUnpricedItems ? 'Priced items: ' : 'Estimated total: '}
                    {formatINR(total)}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
