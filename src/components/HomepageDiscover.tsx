import type { Product } from '../types/product';
import storeContent from '../content/storeContent.json';
import { getLatestProduct } from '../utils/productCollections.js';
import { getHomepageCustomisationWhatsAppLink } from '../utils/whatsapp';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductPageUrl } from '../utils/productLink';
import { getPublicVariantPrice } from '../utils/productPrice';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';

export function HomepageCustomisation() {
  return <section aria-labelledby="customisation-title" className="flex flex-col items-start justify-center gap-3 rounded-2xl border border-mustard/40 bg-cream-dark p-5 text-cocoa sm:p-7">
    <p className="text-xs font-semibold uppercase tracking-wider">Thoughtfully handmade</p>
    <h2 id="customisation-title" className="font-heading text-2xl font-bold">{storeContent.customisation.title}</h2>
    <p className="text-sm leading-relaxed">{storeContent.customisation.description}</p>
    <a href={getHomepageCustomisationWhatsAppLink()} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-3 text-sm font-semibold text-cream">
      {storeContent.customisation.linkLabel}
    </a>
  </section>;
}

export function HomepageSpotlight({ products, onSelect }: {
  products: Product[]; onSelect: (product: Product) => void;
}) {
  const product = getLatestProduct(products);
  const variant = product?.variants.find(item => item.inStock && item.availableQuantity > 0);
  const price = product ? getPublicVariantPrice(product, variant) : null;
  const image = variant?.image || product?.image;
  if (!product || !image) return null;
  return <section aria-labelledby="latest-product-title" className="overflow-hidden rounded-2xl border border-mustard/40 bg-white text-cocoa">
      <a href={toProductPageUrl(product)} onClick={event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onSelect(product);
      }} className="group grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-cocoa sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(240px,38%)] lg:gap-x-10 lg:gap-y-2 lg:p-8">
        <div className="col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="text-xs font-semibold uppercase tracking-wider">Product spotlight</p>
          <h2 id="latest-product-title" className="mt-1 font-heading text-2xl font-bold lg:text-3xl">Latest from Luvia</h2>
        </div>
        <img src={getProductImageUrl(image, 480)} alt={product.name} width={160} height={160} loading="lazy"
          className="aspect-square w-full rounded-xl bg-cream-dark object-contain lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:mx-auto lg:max-h-64 lg:w-full" {...productImageProtection} />
        <div className="min-w-0 space-y-2 lg:col-start-1 lg:row-start-2 lg:self-start">
          <span className="block break-words font-heading text-lg font-bold lg:text-2xl">{product.name}</span>
          {price !== null && <span className="block text-sm font-semibold lg:text-base">{formatINR(price)}</span>}
        </div>
        {product.description.trim() && <span className="col-span-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-cocoa/75 lg:col-span-1 lg:col-start-1 lg:row-start-3">{product.description}</span>}
        <span className="col-span-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 group-hover:text-cocoa-dark lg:col-span-1 lg:col-start-1 lg:row-start-4">Explore this piece</span>
      </a>
    </section>;
}
