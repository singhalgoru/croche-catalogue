import { useEffect, useState, type FormEvent } from 'react';
import { fetchManagedProducts, setProductDiscount, type ManagedProduct } from '../../services/products';
import { formatINR } from '../../utils/currency';
import { calculatePriceAtSellingPrice, DEFAULT_PRICE_DISCOVERY_DEFAULTS } from './priceDiscovery';
import MarginLabel from './MarginLabel';

export default function ProductDiscountManager({ refreshKey, onChanged }: {
  refreshKey: number; onChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [percent, setPercent] = useState('10');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!expanded) return;
    let current = true;
    void fetchManagedProducts().then(value => { if (current) { setProducts(value); setError(''); } })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load products.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [expanded, refreshKey]);
  const product = products.find(item => item.id === productId);
  const previewPercent = Number(percent);
  const validPreview = percent.trim() !== '' && Number.isInteger(previewPercent) && previewPercent >= 1 && previewPercent <= 90;
  const marginPreview = product && validPreview
    ? (product.variants.length ? product.variants : [null]).map(variant => {
      const regularPrice = variant?.price !== null && variant?.price !== undefined
        ? variant.regularPrice ?? variant.price : product.regularPrice ?? product.price;
      const offerPrice = regularPrice !== null
        ? Math.max(1, Math.round(regularPrice * (100 - previewPercent) / 100)) : null;
      const outcome = product.priceDiscoveryInputs && offerPrice !== null
        ? calculatePriceAtSellingPrice(product.priceDiscoveryInputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(offerPrice))
        : null;
      return { id: variant?.id ?? product.id, name: variant?.name ?? 'Product', regularPrice, offerPrice, outcome };
    }) : [];
  const save = async (value: number) => {
    if (!product) { setError('Select a product first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await setProductDiscount(product.id, value);
      const updated = await fetchManagedProducts();
      setProducts(updated);
      await onChanged();
      setMessage(value ? `${value}% product discount applied to ${product.name}.` : `Regular prices restored for ${product.name}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update the product discount.');
    } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
    <button type="button" aria-expanded={expanded} aria-controls="product-discounts-panel"
      onClick={() => { if (!expanded) setLoading(true); setExpanded(value => !value); }} className="flex min-h-11 w-full items-center justify-between gap-4 text-left font-heading text-2xl font-bold">
      <span>Product discounts</span>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard/20">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`h-5 w-5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
    <div id="product-discounts-panel" hidden={!expanded}>
      <p className="mt-2 text-sm">Run an automatic product offer for everyone. All variants receive the same percentage discount, including cart and checkout. Existing coupons can still apply under their normal rules.</p>
      <p className="mt-2 text-xs text-cocoa/70">Prices are rounded to whole rupees, with a minimum of ₹1. Remove the offer before editing regular prices. Existing payment orders keep their quoted prices. Offers stay active until removed.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm font-semibold">{message}</p>}
      {loading ? <p className="mt-3">Loading products...</p> : <form className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(Number(percent)); }}>
        <label className="min-w-0 text-sm font-semibold">Discount product
          <select required value={productId} disabled={busy} onChange={event => {
            const selected = products.find(item => item.id === event.target.value);
            setProductId(event.target.value); setPercent(String(selected?.discountPercent || 10)); setMessage('');
          }} className="mt-1 w-full rounded-xl border border-mustard/60 bg-white p-3">
            <option value="">Select a product</option>
            {products.map(item => <option key={item.id} value={item.id}>
              {item.name} - {item.discountPercent ? `${item.discountPercent}% off applied` : 'No discount'}{!item.published ? ' (hidden)' : ''}
            </option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Discount percentage
          <input type="number" required min="1" max="90" step="1" value={percent}
            onChange={event => setPercent(event.target.value)} disabled={busy}
            className="mt-1 w-full rounded-xl border border-mustard/60 p-3" />
        </label>
        {product && <p className="text-sm sm:col-span-2">
          {product.discountPercent ? `Current offer: ${product.discountPercent}% off. ` : 'No product discount. '}
          {product.price !== null ? `Current product price: ${formatINR(product.price)}. ` : 'Set a public price first. '}
          {product.regularPrice ? `Regular price: ${formatINR(product.regularPrice)}.` : ''}
        </p>}
        {marginPreview.length > 0 && <section aria-label="Post-discount margin preview" className="min-w-0 rounded-xl border border-mustard/40 bg-cream p-3 sm:col-span-2">
          <h3 className="font-semibold">After {previewPercent}% discount (preview)</h3>
          <p className="mt-1 text-xs text-cocoa/70">
            Estimated per-piece profit and margin using saved product costs, labour at ₹100/hour and payment fees of 2% + 18% GST on fees. Saved shipping and packaging costs are included. Extra coupon discounts are not included.
          </p>
          <div className="mt-3 space-y-3">
            {marginPreview.map(row => <div key={row.id} className="rounded-xl bg-white p-3 text-sm">
              <p className="font-bold">{row.name}</p>
              <p className="mt-1">Regular: {row.regularPrice === null ? 'Not set' : formatINR(row.regularPrice)} · Offer: {row.offerPrice === null ? 'Not set' : formatINR(row.offerPrice)}</p>
              {row.outcome ? <>
                <p className="mt-2"><MarginLabel margin={row.outcome.profitMarginPercent}>
                  Post-discount margin: {row.outcome.profitMarginPercent === null ? 'Not calculated' : `${row.outcome.profitMarginPercent.toFixed(1)}%`}
                </MarginLabel></p>
                <p className="mt-2 font-semibold">Estimated profit: {formatINR(row.outcome.profit)} per piece</p>
              </> : <p className="mt-2 text-cocoa/70">Cost details needed. Save complete price discovery costs in Manage products to calculate the post-discount margin.</p>}
            </div>)}
          </div>
          <p className="mt-2 text-xs text-cocoa/70">Preview only until you apply the discount. A negative profit means this offer is estimated to make a loss.</p>
        </section>}
        <button type="submit" disabled={busy || !product || !product.showPrice || product.price === null}
          className="min-h-11 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50">
          {busy ? 'Saving...' : 'Apply product discount'}
        </button>
        <button type="button" disabled={busy || !product?.discountPercent} onClick={() => void save(0)}
          className="min-h-11 rounded-full border border-cocoa/30 px-5 py-3 font-semibold disabled:opacity-50">
          Remove product discount
        </button>
      </form>}
    </div>
  </section>;
}
