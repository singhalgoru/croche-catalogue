import { useEffect, useState } from 'react';
import type { Product } from '../types/product';
import { isSupabaseConfigured, loadSupabase } from '../lib/supabaseConfig';
import { toProductPageUrl } from '../utils/productLink';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getPublicVariantPrice } from '../utils/productPrice';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';
import RotatingCarousel from './RotatingCarousel';

export default function Bestsellers({ products, onSelect, initialIds = [] }: {
  products: Product[]; onSelect: (product: Product) => void;
  /** Build-time ranking so the section renders on first paint instead of shifting the grid down later. */
  initialIds?: string[];
}) {
  const [ids, setIds] = useState<string[]>(() => [...new Set(initialIds)].slice(0, 6));
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
      if (current) setIds([...new Set(data.map(row => String(row.product_id)))].slice(0, 6));
    })().catch(error => console.error('Unable to load bestsellers:', error));
    return () => { current = false; };
  }, []);
  const ranked = ids.flatMap(id => {
    const product = products.find(candidate => candidate.id === id);
    return product && product.variants.some(variant => variant.inStock && variant.availableQuantity > 0) ? [product] : [];
  });
  if (ranked.length < 2) return null;
  return <RotatingCarousel title="Bestsellers" label="bestseller" itemCount={ranked.length} description="Popular over the last 90 days">
      {ranked.map((product, index) => {
        const variant = product.variants.find(item => item.inStock && item.availableQuantity > 0);
        const price = getPublicVariantPrice(product, variant);
        // The first cards sit above the fold on phones and are often the LCP element.
        const loading = index < 3 ? 'eager' : 'lazy';
        return <a key={product.id} href={toProductPageUrl(product)}
          onClick={event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSelect(product);
          }}
          className="w-[42%] min-w-0 shrink-0 snap-start overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cocoa sm:w-[calc((100%-24px)/3)]">
          <div className="relative aspect-square overflow-hidden bg-cream-dark">
            <img src={getProductImageUrl(variant?.image ?? product.image, 480)} alt="" aria-hidden="true"
              width={480} height={480} loading={loading} decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" {...productImageProtection} />
            <img src={getProductImageUrl(variant?.image ?? product.image, 480)} alt={product.name}
              width={480} height={480} loading={loading} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async"
              className="relative h-full w-full object-contain" {...productImageProtection} />
          </div>
          <div className="space-y-1 p-3">
            <h3 className="break-words font-heading font-bold">{product.name}</h3>
            {price !== null && <p className="text-sm font-semibold">{formatINR(price)}</p>}
          </div>
        </a>;
      })}
  </RotatingCarousel>;
}
