import { useState } from 'react';
import type { CategorySettings, Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductPageUrl } from '../utils/productLink';
import ProductDiscount from './ProductDiscount';
import { getCategoryHotspots } from '../utils/categoryImage.js';

export default function CategoryLook({ category, products }: { category: CategorySettings; products: Product[] }) {
  const [active, setActive] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const spots = getCategoryHotspots(products, category);
  if (!category.coverImage || !spots.length) return null;
  const selected = spots[active] ?? spots[0];

  return <section aria-label={`Shop the look: ${category.name}`} className="max-w-3xl space-y-3 rounded-2xl border border-mustard/40 bg-white p-3 sm:p-5">
    <h2 className="font-heading text-xl font-bold">Shop this look</h2>
    <p className="text-sm text-cocoa/70">Tap a glowing dot to explore the product. All linked products are also listed below.</p>
    {imageFailed ? <p role="alert">This collection photo could not load. You can still explore its linked products below.</p> :
      <div className="relative">
        <img src={getProductImageUrl(category.coverImage, 1080)} alt={`${category.name} styled collection`}
          onError={() => setImageFailed(true)} className="block h-auto w-full rounded-xl" />
        {spots.map((spot, index) => <button key={`${spot.productId}-${index}`} type="button"
          aria-label={`Explore ${spot.product.name}, hotspot ${index + 1}`} aria-pressed={selected === spot}
          onClick={() => setActive(index)}
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
          <span aria-hidden="true" className={`h-3 w-3 rounded-full border-2 border-white bg-mustard shadow-[0_0_0_7px_#edc35759,0_0_0_13px_#edc3572e] ${
            selected === spot ? 'ring-2 ring-cocoa' : 'motion-safe:animate-pulse'
          }`} />
        </button>)}
      </div>}
    <div aria-live="polite" className="flex items-center gap-3 rounded-xl bg-cream p-3">
      <img src={getProductImageUrl(selected.product.image, 160)} alt="" width={80} height={80}
        className="h-20 w-20 rounded-lg object-contain" loading="lazy" />
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold">{selected.product.name}</h3>
        {selected.product.showPrice !== false && selected.product.price !== null &&
          <p>{formatINR(selected.product.price)} <ProductDiscount product={selected.product} /></p>}
        {!selected.product.inStock && <p className="text-sm">Out of stock</p>}
        <a href={toProductPageUrl(selected.product)}
          className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream">
          View product
        </a>
      </div>
    </div>
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Products in this look">
      {spots.map((spot, index) => <li key={`${spot.productId}-${index}`}>
        <a href={toProductPageUrl(spot.product)} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {index + 1}. {spot.product.name}
        </a>
      </li>)}
    </ol>
  </section>;
}
