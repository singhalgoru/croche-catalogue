import type { MouseEvent } from 'react';
import type { Product } from '../types/product';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { toProductPageUrl } from '../utils/productLink';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getRelatedProducts } from '../utils/relatedProducts';

interface Props {
  product: Product;
  products: Product[];
  onSelect: (product: Product) => void;
}

export default function RelatedProducts({ product, products, onSelect }: Props) {
  const related = getRelatedProducts(product, products);
  if (!related.length) return null;

  const openProduct = (event: MouseEvent<HTMLAnchorElement>, candidate: Product) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelect(candidate);
  };

  return (
    <section aria-labelledby="related-products-heading" className="border-t border-mustard/30 pt-6">
      <h2 id="related-products-heading" className="mb-4 font-heading text-2xl font-bold text-cocoa">
        More from this collection
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {related.map(candidate => {
          const variant = candidate.variants.find(item => item.inStock) ?? candidate.variants[0];
          const price = getPublicVariantPrice(candidate, variant);
          return (
            <a key={candidate.id} href={toProductPageUrl(candidate)}
              onClick={event => openProduct(event, candidate)}
              className="min-w-0 overflow-hidden rounded-xl border border-mustard/30 bg-white transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-cocoa">
              <img src={getProductImageUrl(candidate.image, 480)}
                srcSet={getProductCardSrcSet(candidate.image)}
                sizes="(min-width: 1024px) 270px, (min-width: 640px) 45vw, 50vw"
                alt={candidate.name} width={480} height={480} loading="lazy"
                className="aspect-square w-full object-cover" {...productImageProtection} />
              <div className="space-y-1 p-3 text-cocoa">
                <h3 className="break-words font-heading font-bold">{candidate.name}</h3>
                {price !== null && <p className="text-sm font-semibold">{formatINR(price)}</p>}
                <p className="text-xs text-cocoa/70">{candidate.inStock ? 'In stock' : 'Out of stock'}</p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
