import { useEffect, useState } from 'react';
import type { Product } from '../types/product';
import { isSupabaseConfigured, loadSupabase } from '../lib/supabaseConfig';
import { toProductPageUrl } from '../utils/productLink';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getPublicVariantPrice } from '../utils/productPrice';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';

export default function Bestsellers({ products, onSelect }: {
  products: Product[]; onSelect: (product: Product) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let current = true;
    void (async () => {
      const client = await loadSupabase();
      if (!client) throw new Error('Supabase is not configured.');
      const { data, error } = await client.rpc('get_catalogue_bestsellers');
      if (error) throw new Error(error.message);
      if (!Array.isArray(data) || data.some(row =>
        !row || typeof row !== 'object' || typeof row.product_id !== 'string')) {
        throw new Error('Invalid bestsellers response.');
      }
      if (current) setIds([...new Set(data.map(row => String(row.product_id)))].slice(0, 4));
    })().catch(error => console.error('Unable to load bestsellers:', error));
    return () => { current = false; };
  }, []);
  const ranked = ids.flatMap(id => {
    const product = products.find(candidate => candidate.id === id);
    return product && product.variants.some(variant => variant.inStock && variant.availableQuantity > 0) ? [product] : [];
  });
  if (ranked.length < 2) return null;
  return <section aria-labelledby="bestsellers-heading" className="space-y-3">
    <h2 id="bestsellers-heading" className="font-heading text-2xl font-bold text-cocoa">Bestsellers</h2>
    <p className="text-sm text-cocoa/75">Popular over the last 90 days</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ranked.map(product => {
        const variant = product.variants.find(item => item.inStock && item.availableQuantity > 0);
        const price = getPublicVariantPrice(product, variant);
        return <a key={product.id} href={toProductPageUrl(product)}
          onClick={event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSelect(product);
          }}
          className="min-w-0 overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md">
          <img src={getProductImageUrl(variant?.image ?? product.image, 480)} alt={product.name}
            width={480} height={480} loading="lazy" className="aspect-square w-full object-cover" {...productImageProtection} />
          <div className="space-y-1 p-3">
            <h3 className="break-words font-heading font-bold">{product.name}</h3>
            {price !== null && <p className="text-sm font-semibold">{formatINR(price)}</p>}
          </div>
        </a>;
      })}
    </div>
  </section>;
}
