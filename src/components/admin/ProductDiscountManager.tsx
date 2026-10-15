import { useEffect, useState, type FormEvent } from 'react';
import { fetchManagedProducts, setProductDiscount, type ManagedProduct } from '../../services/products';
import { formatINR } from '../../utils/currency';

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
      onClick={() => { if (!expanded) setLoading(true); setExpanded(value => !value); }} className="min-h-11 w-full text-left font-heading text-2xl font-bold">
      Product discounts
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
            {products.map(item => <option key={item.id} value={item.id}>{item.name}{!item.published ? ' (hidden)' : ''}</option>)}
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
