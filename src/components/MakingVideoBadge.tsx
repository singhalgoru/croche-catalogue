import type { Product } from '../types/product';
import { toProductPageUrl } from '../utils/productLink';

export default function MakingVideoBadge({ product, belowStockLabel = false }: { product: Product; belowStockLabel?: boolean }) {
  return <a href={`${toProductPageUrl(product)}?watch=making-video#making-video`}
    aria-label={`Watch making video for ${product.name}`} title="Watch making video"
    className={`absolute ${belowStockLabel ? 'top-10' : 'top-2'} right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-cocoa/20 bg-cream/95 text-cocoa shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M8 5.5a1 1 0 0 1 1.5-.86l10 6.5a1 1 0 0 1 0 1.72l-10 6.5A1 1 0 0 1 8 18.5z" />
    </svg>
  </a>;
}
