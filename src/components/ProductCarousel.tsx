import type { Product } from '../types/product';
import { toProductPageUrl } from '../utils/productLink';
import { getProductImageUrl } from '../utils/productImageUrl';
import { getPublicVariantPrice } from '../utils/productPrice';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';
import RotatingCarousel from './RotatingCarousel';
import MakingVideoBadge from './MakingVideoBadge';

export default function ProductCarousel({ products, onSelect, title, label, viewAll, description }: {
  products: Product[]; onSelect: (product: Product) => void;
  title: string; label: string; viewAll: string; description: string;
}) {
  if (products.length === 0) return null;
  return <RotatingCarousel title={title} label={label} itemCount={products.length} viewAll={viewAll} description={description}>
      {products.map((product, index) => {
        const variant = product.variants.find(item => item.inStock && item.availableQuantity > 0);
        const price = getPublicVariantPrice(product, variant);
        // The first cards sit above the fold on phones and are often the LCP element.
        const loading = index < 3 ? 'eager' : 'lazy';
        return <div key={product.id} className="relative w-[42%] min-w-0 shrink-0 snap-start sm:w-[calc((100%-24px)/3)]">
          <a href={toProductPageUrl(product)}
          onClick={event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSelect(product);
          }}
          className="block h-full overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cocoa">
          <div className="relative aspect-square overflow-hidden bg-cream-dark">
            <img src={getProductImageUrl(variant?.image ?? product.image, 160)} alt="" aria-hidden="true"
              width={160} height={160} loading={loading} decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" {...productImageProtection} />
            <img src={getProductImageUrl(variant?.image ?? product.image, 480)} alt={product.name}
              width={480} height={480} loading={loading} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async"
              className="relative h-full w-full object-contain" {...productImageProtection} />
          </div>
          <div className="space-y-1 p-3">
            <h3 className="break-words font-heading font-bold">{product.name}</h3>
            {price !== null && <p className="text-sm font-semibold">{formatINR(price)}</p>}
          </div>
        </a>
        {product.makingVideo && <MakingVideoBadge product={product} />}
        </div>;
      })}
  </RotatingCarousel>;
}
