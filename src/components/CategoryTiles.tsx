import type { Product } from '../types/product';
import { collectionPath } from '../utils/collectionLink.js';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { productImageProtection } from '../utils/imageProtection';

export default function CategoryTiles({ categories, products }: {
  categories: string[]; products: Product[];
}) {
  return <nav aria-label="Explore collections" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    {categories.map(category => {
      const candidates = products.filter(product => product.category === category);
      const product = candidates.find(candidate => candidate.inStock) ?? candidates[0];
      if (!product) return null;
      const image = product.variants.find(variant => variant.inStock)?.image ?? product.image;
      return <a key={category} href={collectionPath(category)}
        className="min-w-0 overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-cocoa">
        <img src={getProductImageUrl(image, 480)} srcSet={getProductCardSrcSet(image)}
          sizes="(min-width: 1024px) 180px, (min-width: 640px) 30vw, 45vw"
          alt="" width={480} height={480} loading="lazy"
          className="aspect-square w-full object-cover" {...productImageProtection} />
        <span className="block break-words p-3 text-center text-sm font-semibold text-cocoa">{category}</span>
      </a>;
    })}
  </nav>;
}
