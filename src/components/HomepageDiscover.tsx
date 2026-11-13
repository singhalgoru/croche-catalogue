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
  return <section aria-labelledby="latest-product-title" className="rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wider">Product spotlight</p>
      <h2 id="latest-product-title" className="mt-1 font-heading text-2xl font-bold">Latest from Luvia</h2>
      <a href={toProductPageUrl(product)} onClick={event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onSelect(product);
      }} className="mt-3 flex items-center gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
        <img src={getProductImageUrl(image, 480)} alt={product.name} width={160} height={160} loading="lazy"
          className="aspect-square w-28 shrink-0 rounded-xl bg-cream-dark object-contain sm:w-36" {...productImageProtection} />
        <span className="space-y-2"><span className="block font-heading text-lg font-bold">{product.name}</span>
          {price !== null && <span className="block text-sm font-semibold">{formatINR(price)}</span>}
          <span className="block text-sm font-semibold underline underline-offset-4">Explore this piece</span></span>
      </a>
    </section>;
}
