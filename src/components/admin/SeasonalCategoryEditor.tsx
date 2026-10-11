import { useEffect, useState } from 'react';
import { saveSeasonalCategory } from '../../services/categories';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import type { CategorySettings } from '../../types/product';

export default function SeasonalCategoryEditor({ category, onChanged, onClose }: {
  category: CategorySettings; onChanged: () => Promise<void>; onClose: () => void;
}) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [selected, setSelected] = useState(() => new Set(category.productIds ?? []));
  const [visible, setVisible] = useState(category.visible !== false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void fetchManagedProducts().then(value => { if (current) setProducts(value); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load products.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await saveSeasonalCategory(category.name, [...selected], visible);
      await onChanged();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save seasonal category.');
    } finally { setBusy(false); }
  };
  return <section aria-label={`Products in ${category.name}`} className="mt-4 rounded-xl border border-mustard/40 bg-white p-4">
    <h3 className="font-heading text-xl font-bold">{category.name} products</h3>
    <p className="mt-2 text-sm text-cocoa/70">Select existing products. Their original categories, prices and stock remain unchanged. A product can belong to several seasonal categories.</p>
    <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={visible} disabled={busy} onChange={event => setVisible(event.target.checked)} />
      Show this seasonal category in the shop
    </label>
    <label className="mt-3 block text-sm">Search products
      <input type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)}
        className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
    </label>
    {loading ? <p role="status" className="mt-3 text-sm">Loading products…</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
      {products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase())).map(product => <label
        key={product.id} className="flex items-center gap-3 rounded-lg bg-cream p-2 text-sm">
        <input type="checkbox" checked={selected.has(product.id)} disabled={busy}
          onChange={event => setSelected(current => {
            const next = new Set(current);
            if (event.target.checked) next.add(product.id); else next.delete(product.id);
            return next;
          })} />
        {product.name} · {product.category}{!product.published ? ' · Unpublished (not shown to shoppers)' : ''}
      </label>)}
      {products.length === 0 && !error && <p>No products available yet.</p>}
    </div>}
    <p className="mt-2 text-xs text-cocoa/70">{selected.size} selected. Only published products appear in the shop. Empty seasonal categories are not shown in the shop navigation.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex gap-3">
      <button type="button" disabled={busy || loading || products.length === 0} onClick={() => { void save(); }}
        className="min-h-11 rounded-full bg-cocoa px-4 py-2 font-semibold text-cream disabled:opacity-60">{busy ? 'Saving…' : 'Save seasonal category'}</button>
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2">Cancel</button>
    </div>
  </section>;
}
