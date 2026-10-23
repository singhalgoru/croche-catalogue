import { useState } from 'react';
import { deleteSellerOrder, saveSellerOrderCosts, type SellerSale } from '../../services/sellerSales';
import { formatINR } from '../../utils/currency';
import { summarizeSellerSales } from './sellerSalesSummary';
import MarginLabel from './MarginLabel';

export default function SellerOrderSummary({ sales, onChanged }: { sales: SellerSale[]; onChanged: () => Promise<void> }) {
  const order = sales[0].order;
  const [packaging,setPackaging] = useState(String(order?.packagingCost ?? 0));
  const [shipping,setShipping] = useState(String(order?.shippingCost ?? 0));
  const [source,setSource] = useState<'manual' | 'courier'>(order?.shippingSource === 'courier' ? 'courier' : 'manual');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [deleting,setDeleting] = useState(false);
  if (!order) return null;
  const totals = summarizeSellerSales(sales);
  async function save(remove = false) {
    if (!order) return;
    setBusy(true); setError('');
    try {
      if (remove) await deleteSellerOrder(order.id);
      else {
        if (packaging.trim() === '' || shipping.trim() === '') throw new Error('Enter whole-order packaging and shipping costs, or 0 if none.');
        await saveSellerOrderCosts(order.id,Number(packaging),Number(shipping),source);
      }
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update this order.');
    } finally { setBusy(false); }
  }
  return <header className="rounded-xl bg-cream/80 p-4" aria-label={`Order ${order.reference}`}>
    <h4 className="font-heading text-lg font-bold">Order {order.reference}</h4>
    <p className="mt-1 text-sm">{sales.length} product lines · {totals.piecesSold} pieces · Revenue {formatINR(totals.revenue)}</p>
    <MarginLabel margin={totals.marginPercent} className="mt-2 inline-block">
      <span>Estimated order profit: {formatINR(totals.profit)} · margin {totals.marginPercent === null ? '—' : `${totals.marginPercent.toFixed(1)}%`}</span>
    </MarginLabel>
    <p className="mt-2 text-sm">Whole-order packaging {formatINR(order.packagingCost)} · shipping {formatINR(order.shippingCost)}
      {' '}({order.shippingSource === 'courier' ? 'approved booked courier' : order.shippingSource === 'estimate' ? 'provisional; enter actual cost or book a courier' : 'manual'})
      {' '}· Customer shipping collected {formatINR(order.shippingCollected)}</p>
    <p className="mt-1 text-xs text-cocoa/70">Shipping and packaging are charged once per order. Item shipping and packaging are zero; item profit includes a revenue-weighted share of order costs and shipping collected. Verify the saved packaging estimate for the actual parcel. Estimates exclude monthly overheads and later adjustments.</p>
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">Edit whole-order costs</summary>
      <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="text-sm">Packaging for entire order (₹)
          <input aria-label={`Order packaging ${order.reference}`} type="number" min="0" max="1000000" step="0.01" required
            className="mt-1 block rounded-lg border p-2" value={packaging} onChange={event => setPackaging(event.target.value)} />
        </label>
        {order.paymentOrderId && <label className="text-sm">Shipping cost source
          <select aria-label={`Shipping source ${order.reference}`} className="mt-1 block rounded-lg border p-2" value={source}
            onChange={event => setSource(event.target.value === 'courier' ? 'courier' : 'manual')}>
            <option value="manual">Manual whole-order cost</option>
            <option value="courier">Approved booked courier</option>
          </select>
        </label>}
        <label className="text-sm">Shipping for entire order (₹)
          <input aria-label={`Order shipping ${order.reference}`} type="number" min="0" max="1000000" step="0.01" required
            disabled={source === 'courier'} className="mt-1 block rounded-lg border p-2 disabled:opacity-50"
            value={shipping} onChange={event => setShipping(event.target.value)} />
        </label>
        <button disabled={busy} className="min-h-11 rounded-full border px-4 py-2 text-sm font-semibold">Save order costs</button>
      </form>
      <p className="mt-2 text-xs text-cocoa/70">Courier cost is read from the server only after a successful AWB booking. A manual override is preserved on subsequent courier updates.</p>
    </details>
    <button type="button" disabled={busy} className="mt-3 min-h-11 text-sm text-red-700 underline" onClick={() => setDeleting(!deleting)}>Delete whole order</button>
    {deleting && <div className="mt-2 text-sm text-red-800">
      <p>Delete all sale records for this order from the ledger? This does not cancel payment, refund the buyer or cancel the courier.</p>
      <button type="button" disabled={busy} className="mt-2 min-h-11 rounded-full border px-4" onClick={() => void save(true)}>Confirm delete order</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </header>;
}
