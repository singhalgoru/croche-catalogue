import { useEffect, useState } from 'react';
import { fetchCustomerOrders } from '../services/customer';
import type { CustomerOrder } from '../types/customer';
import { formatINR } from '../utils/currency';

const statusLabels: Record<CustomerOrder['status'], string> = {
  creating_link: 'Preparing payment',
  link_created: 'Awaiting payment',
  link_failed: 'Payment link failed',
  paid: 'Payment received',
  expired: 'Payment link expired',
  cancelled: 'Cancelled',
  review_required: 'Payment under review',
};

export default function CustomerOrders() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState({ offset: 0, refresh: 0 });
  useEffect(() => {
    let current = true;
    void fetchCustomerOrders(page.offset).then(values => {
      if (!current) return;
      setOrders(previous => page.offset ? [...previous, ...values] : values);
      setHasMore(values.length === 20);
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to load your orders.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page]);
  return (
    <section aria-label="Your orders" className="mt-4 border-t border-cocoa/20 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Your orders</h3>
        <button type="button" disabled={loading} className="min-h-11 underline disabled:opacity-50"
          onClick={() => { setLoading(true); setError(''); setPage(previous => ({ offset: 0, refresh: previous.refresh + 1 })); }}>Refresh orders</button>
      </div>
      <p className="mb-3 text-xs text-cocoa/70">Recorded orders and their payment status. WhatsApp/email enquiries are not confirmed orders. Dispatch and delivery updates are shared by Luvia separately.</p>
      {loading && <p role="status">Loading your orders...</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && orders.length === 0 && <p>No orders yet.</p>}
      <div className="space-y-3">
        {orders.map(order => (
          <article key={order.id} aria-label={`Order ${order.reference}`} className="rounded-xl border border-cocoa/20 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{order.reference}</h4>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === 'paid' ? 'bg-green-50 text-green-800' : 'bg-mustard/15 text-cocoa'}`}>
                {statusLabels[order.status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-cocoa/70">
              Placed {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {order.paidAt && ` · Paid ${new Date(order.paidAt).toLocaleDateString('en-IN')}`}
            </p>
            <p className="mt-2">Recipient: {order.customerName}{order.deliveryPincode ? ` · Pincode: ${order.deliveryPincode}` : ''}</p>
            <ul className="my-3 space-y-2">
              {order.items.map(item => <li key={item.id} className="flex justify-between gap-3">
                <span>{item.productName}{item.variantName ? ` (${item.variantName})` : ''}<span className="block text-xs text-cocoa/70">Qty {item.quantity} × {formatINR(item.unitPrice)}</span></span>
                <span className="shrink-0">{formatINR(item.lineTotal)}</span>
              </li>)}
            </ul>
            <dl className="space-y-1 border-t border-cocoa/10 pt-2">
              <div className="flex justify-between"><dt>Items subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
              {order.discount > 0 && <div className="flex justify-between text-green-800"><dt>Coupon discount</dt><dd>-{formatINR(order.discount)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{order.shipping ? formatINR(order.shipping) : 'Free'}</dd></div>
              <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      {hasMore && <button type="button" disabled={loading} className="mt-3 min-h-11 underline disabled:opacity-50"
        onClick={() => { setLoading(true); setError(''); setPage(previous => ({ ...previous, offset: error ? previous.offset : orders.length })); }}>
        {error ? 'Retry loading orders' : 'Load more orders'}
      </button>}
    </section>
  );
}
