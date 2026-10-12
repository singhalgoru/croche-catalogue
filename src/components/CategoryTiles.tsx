import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from '../utils/categorySelection';
import { collectionPath } from '../utils/collectionLink.js';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { productImageProtection } from '../utils/imageProtection';
import RotatingCarousel from './RotatingCarousel';

export default function CategoryTiles({ categories, products, categorySettings = [] }: {
  categories: string[]; products: Product[]; categorySettings?: CategorySettings[];
}) {
  const seasonal = new Set(categorySettings.filter(category => category.isSeasonal).map(category => category.name));
  const orderedCategories = [...categories.filter(category => seasonal.has(category)),
    ...categories.filter(category => !seasonal.has(category))];
  return <RotatingCarousel title="Explore collections" label="collection" navigation viewAll="/collections/" itemCount={categories.length}>
    {orderedCategories.map(category => {
      const candidates = products.filter(product => matchesCategory(product, category, categorySettings));
      const product = candidates.find(candidate => candidate.inStock) ?? candidates[0];
      if (!product) return null;
      const settings = categorySettings.find(item => item.name === category);
      const image = (settings?.isSeasonal && settings.coverImage) || (product.variants.find(variant => variant.inStock)?.image ?? product.image);
      return <a key={category} href={collectionPath(category)}
        className="w-[38%] min-w-0 shrink-0 snap-start overflow-hidden rounded-xl border border-mustard/30 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cocoa sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]">
        <img src={getProductImageUrl(image, 480)} srcSet={getProductCardSrcSet(image)}
          sizes="(min-width: 1024px) 180px, (min-width: 640px) 24vw, 38vw"
          alt="" width={480} height={480} loading="lazy"
          className="aspect-square w-full bg-cream-dark object-contain" {...productImageProtection} />
        <span className={`block break-words p-3 text-center text-sm font-semibold text-cocoa ${settings?.isSeasonal ? 'badge-glow bg-mustard/20' : ''}`}>{category}</span>
      </a>;
    })}
  </RotatingCarousel>;
}
