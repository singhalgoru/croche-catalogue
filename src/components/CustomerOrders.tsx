import { useEffect, useState } from 'react';
import { fetchCustomerOrders, hideCancelledLiveOrder, setCustomerOrderHidden } from '../services/customer';
import type { CustomerOrder, ReorderResult } from '../types/customer';
import { formatINR } from '../utils/currency';
import { deliveryAddressText, fulfilmentLabels } from '../utils/customer';
import OrderFulfilmentForm from './admin/OrderFulfilmentForm';
import { trackEvent } from '../services/analytics';

const statusLabels: Record<CustomerOrder['status'], string> = {
  creating_link: 'Preparing payment',
  link_created: 'Awaiting payment',
  link_failed: 'Payment link failed',
  paid: 'Payment received',
  expired: 'Payment link expired',
  cancelled: 'Cancelled',
  review_required: 'Payment under review',
};

export default function CustomerOrders({ loadOrders = fetchCustomerOrders, admin = false, onReorder, onOpenCart }: {
  loadOrders?: (offset: number, hidden?: boolean) => Promise<CustomerOrder[]>;
  admin?: boolean;
  onReorder?: (orderId: string) => Promise<ReorderResult>;
  onOpenCart?: () => void;
}) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState({ offset: 0, refresh: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [actionOrder, setActionOrder] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ReorderResult | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const rank = (order: CustomerOrder) => order.hidden ? 3 : order.status === 'paid' && order.fulfilment?.status !== 'delivered'
    ? 0 : ['creating_link', 'link_created', 'review_required'].includes(order.status) ? 1 : 2;
  const displayedOrders = admin ? orders : orders.filter(order => Boolean(order.hidden) === showHidden)
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  useEffect(() => {
    let current = true;
    void (admin ? loadOrders(page.offset) : loadOrders(page.offset, showHidden)).then(values => {
      if (!current) return;
      setOrders(previous => page.offset ? [...previous, ...values] : values);
      setHasMore(values.length === 20);
      if (!admin && page.offset === 0) trackEvent('view_orders', { hidden_orders: showHidden, order_count: values.length });
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to load your orders.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, loadOrders, admin, showHidden]);
  const changeVisibility = (hidden: boolean) => {
    if (showHidden === hidden) return;
    setShowHidden(hidden); setLoading(true); setError(''); setOrders([]);
    setPage(previous => ({ offset: 0, refresh: previous.refresh + 1 }));
  };
  return (
    <section aria-label={admin ? 'Online orders' : 'Your orders'} className={admin
      ? 'mb-8 rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm'
      : 'mt-4 border-t border-cocoa/20 pt-4'}>
      <div className="flex items-center justify-between gap-3">
        {admin ? <button type="button" aria-label="Online orders" aria-expanded={isExpanded}
          aria-controls="online-orders-content" onClick={() => setIsExpanded(current => !current)}
          className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left">
          <span>
            <span className="block font-heading text-2xl font-bold text-cocoa">Online orders</span>
            <span className="mt-1 block text-sm text-cocoa/65">
              {loading ? 'Loading online orders...' : `${orders.length}${hasMore ? '+' : ''} online order${orders.length === 1 ? '' : 's'} loaded`}
            </span>
          </span>
          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard/20 text-xl text-cocoa transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
        </button> : <h3 className="font-semibold">Your orders</h3>}
        <button type="button" disabled={loading || removing} aria-label="Refresh orders" className={admin
          ? 'rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50'
          : 'min-h-11 underline disabled:opacity-50'}
          onClick={() => { setLoading(true); setError(''); setPage(previous => ({ offset: 0, refresh: previous.refresh + 1 })); }}>
          {admin ? loading ? 'Loading…' : 'Refresh' : 'Refresh orders'}
        </button>
      </div>
      {error && <p role="alert" className={admin
        ? 'mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
        : 'text-red-700'}>{error}</p>}
      <div id={admin ? 'online-orders-content' : undefined} hidden={admin && !isExpanded}>
      {!admin && <div className="my-3 flex gap-4">
        <button type="button" disabled={actionOrder !== null} aria-pressed={!showHidden} className="min-h-11 underline" onClick={() => changeVisibility(false)}>Current & past orders</button>
        <button type="button" disabled={actionOrder !== null} aria-pressed={showHidden} className="min-h-11 underline" onClick={() => changeVisibility(true)}>Hidden orders</button>
      </div>}
      {actionMessage && <p role="status" className="my-2 text-sm text-cocoa">{actionMessage}</p>}
      {actionResult && <div className="my-3 rounded-xl border border-mustard/40 p-3 text-sm">
        <p role="status">{actionResult.added ? `${actionResult.added} order item${actionResult.added === 1 ? '' : 's'} added to your cart at current prices.` : 'No items added to your cart.'} Existing cart items were kept. Quantities meet current minimum orders.</p>
        {actionResult.skipped.length > 0 && <ul className="mt-2 list-inside list-disc">{actionResult.skipped.map((item, index) => <li key={index}>{item.productName}{item.variantName ? ` (${item.variantName})` : ''}: {item.reason}</li>)}</ul>}
        {onOpenCart && actionResult.added > 0 && <button type="button" onClick={onOpenCart} className="mt-2 min-h-11 underline">View cart</button>}
      </div>}
      <p className={admin ? 'mb-3 mt-4 text-sm text-cocoa/65' : 'mb-3 text-xs text-cocoa/70'}>{admin
        ? 'Awaiting payment starts when Razorpay checkout is created. Unpaid checkout expires after 30 minutes; changing the cart cancels the old checkout only after provider checks. Fulfil only Payment received orders. Removing a cancelled or expired entry hides it from this list, not from payment records.'
        : 'Track your order status and delivery progress here. WhatsApp/email enquiries are not confirmed orders. Refresh orders for the latest updates.'}</p>
      {loading && <p role="status">Loading your orders...</p>}
      {!loading && !error && displayedOrders.length === 0 && <p>{showHidden ? 'No hidden orders loaded.' : orders.length ? 'No visible orders loaded.' : 'No orders yet.'}</p>}
      <div className="space-y-3">
        {displayedOrders.map(order => (
          <article key={order.id} aria-label={`Order ${order.reference}`} className={admin
            ? 'rounded-2xl border border-mustard/30 bg-cream/40 p-4'
            : 'rounded-xl border border-cocoa/20 p-3 sm:p-4'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className={admin ? 'font-heading text-lg font-bold text-cocoa' : 'font-semibold'}>{order.reference}</h4>
              {admin ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === 'paid' ? 'bg-green-50 text-green-800' : 'bg-mustard/15 text-cocoa'}`}>
                {statusLabels[order.status]}
              </span> : <div aria-label={`Order status for ${order.reference}`}
                className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 ${order.status === 'paid' && order.fulfilment?.status === 'delivered'
                  ? 'border-green-200 bg-green-50 text-green-800' : 'border-mustard/40 bg-mustard/15 text-cocoa'}`}>
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-current" />
                <span><span className="block text-xs font-semibold uppercase tracking-wide">Status</span>
                  <span className="block text-lg font-bold">{order.status === 'paid'
                    ? fulfilmentLabels[order.fulfilment?.status ?? 'confirmed'] : statusLabels[order.status]}</span>
                </span>
              </div>}
              {admin && order.status === 'paid' && order.fulfilment && <span className="rounded-full bg-mustard/20 px-3 py-1 text-xs font-semibold text-cocoa">
                Order: {fulfilmentLabels[order.fulfilment.status]}
              </span>}
              {admin && <button type="button" className="min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold text-cocoa"
                aria-expanded={expanded.has(order.id)} aria-controls={`order-details-${order.id}`}
                aria-label={`${expanded.has(order.id) ? 'Hide' : 'Show'} details for ${order.reference}`}
                onClick={() => setExpanded(previous => {
                  const next = new Set(previous);
                  if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                  return next;
                })}>{expanded.has(order.id) ? 'Hide details' : 'Show details'}</button>}
            </div>
            {!admin && <div className="mt-3 flex flex-wrap gap-4">
              {onReorder && <button type="button" disabled={loading || actionOrder !== null}
                aria-label={`Reorder ${order.reference}`} className="min-h-11 rounded-full bg-cocoa px-4 py-2 text-cream disabled:opacity-50"
                onClick={() => {
                  setActionOrder(order.id); setError(''); setActionResult(null); setActionMessage('');
                  void onReorder(order.id).then(setActionResult)
                    .catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to reorder.'))
                    .finally(() => setActionOrder(null));
                }}>{actionOrder === order.id ? 'Updating...' : 'Reorder'}</button>}
              {(order.hidden || (['cancelled', 'expired'].includes(order.status) && !order.paidAt)) && <button type="button"
                disabled={loading || actionOrder !== null} className="min-h-11 underline disabled:opacity-50"
                aria-label={`${order.hidden ? 'Restore' : 'Hide'} ${order.reference}`}
                onClick={() => {
                  setActionOrder(order.id); setError(''); setActionMessage('');
                  void setCustomerOrderHidden(order.id, !order.hidden).then(() => {
                    trackEvent(order.hidden ? 'restore_order' : 'hide_order', { order_status: order.status });
                    setOrders(current => current.map(value => value.id === order.id ? { ...value, hidden: !order.hidden } : value));
                    setActionMessage(order.hidden ? 'Order restored.' : 'Order moved to Hidden orders. Payment records are unchanged.');
                  }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to update order visibility.'))
                    .finally(() => setActionOrder(null));
                }}>{order.hidden ? 'Restore order' : 'Hide order'}</button>}
            </div>}
            <p className="mt-1 text-xs text-cocoa/70">
              Placed {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {admin && order.paidAt && ` · Paid ${new Date(order.paidAt).toLocaleDateString('en-IN')}`}
            </p>
            {admin && order.status === 'link_created' && order.expiresAt && <p className="text-xs text-cocoa/70">
              Payment window ends {new Date(order.expiresAt).toLocaleString('en-IN')}. Refresh orders to check the latest status.
            </p>}
            <div id={`order-details-${order.id}`} hidden={admin && !expanded.has(order.id)}>
            <p className="mt-2">Recipient: {order.customerName}{order.deliveryPincode ? ` · Pincode: ${order.deliveryPincode}` : ''}</p>
            {order.deliveryDetails && <div className="mt-1 break-words text-xs">
              <p>{deliveryAddressText(order.deliveryDetails)}</p>
              <p>+91{order.deliveryDetails.phone}{order.deliveryDetails.email ? ` · ${order.deliveryDetails.email}` : ''}</p>
            </div>}
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
            {order.status === 'paid' && order.fulfilment && <div className="mt-3 break-words text-sm">
              {order.fulfilment.courierName && <p>Courier: {order.fulfilment.courierName}</p>}
              {order.fulfilment.trackingNumber && <p>Tracking number: {order.fulfilment.trackingNumber}</p>}
              {order.fulfilment.trackingUrl.startsWith('https://') && <a href={order.fulfilment.trackingUrl}
                target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-2 underline">Track shipment</a>}
              {admin && <OrderFulfilmentForm key={`${order.id}-${order.fulfilment.updatedAt}`} orderId={order.id}
                reference={order.reference} fulfilment={order.fulfilment} onSaved={(fulfilment, message) => {
                  setOrders(current => current.map(value => value.id === order.id ? { ...value, fulfilment } : value));
                  setActionMessage(`${order.reference}: ${message}`);
                }} />}
            </div>}
            </div>
            {admin && ['cancelled', 'expired'].includes(order.status) && !order.paidAt && (confirmRemoval === order.id
              ? <div className="mt-2 rounded-lg border border-cocoa/20 p-3">
                <p className="text-xs">Remove this {order.status} entry from the list? The payment record remains available for reconciliation.</p>
                <button type="button" disabled={removing || loading} className="mr-4 min-h-11 text-red-700 underline"
                  onClick={() => {
                    setRemoving(true); setError('');
                    void hideCancelledLiveOrder(order.id).then(() => {
                      setConfirmRemoval(null); setLoading(true);
                      setPage(previous => ({ offset: 0, refresh: previous.refresh + 1 }));
                    }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to remove unpaid order.'))
                      .finally(() => setRemoving(false));
                  }}>Confirm removal</button>
                <button type="button" disabled={removing} className="min-h-11 underline"
                  onClick={() => setConfirmRemoval(null)}>Keep entry</button>
              </div>
              : <button type="button" disabled={loading || removing} className="mt-2 min-h-11 text-red-700 underline"
                aria-label={`Remove ${order.reference} from list`}
                onClick={() => setConfirmRemoval(order.id)}>Remove from list</button>)}
          </article>
        ))}
      </div>
      {hasMore && <button type="button" disabled={loading || removing} className="mt-3 min-h-11 underline disabled:opacity-50"
        onClick={() => { setLoading(true); setError(''); setPage(previous => ({ ...previous, offset: error ? previous.offset : orders.length })); }}>
        {error ? 'Retry loading orders' : 'Load more orders'}
      </button>}
      </div>
    </section>
  );
}
