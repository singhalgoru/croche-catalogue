import type { CategorySettings, Product } from '../types/product';
import { matchesCategory } from '../utils/categorySelection';
import { collectionPath } from '../utils/collectionLink.js';
import { getProductCardSrcSet, getProductImageUrl } from '../utils/productImageUrl';
import { productImageProtection } from '../utils/imageProtection';
import RotatingCarousel from './RotatingCarousel';
import { getCategoryImage } from '../utils/categoryImage.js';

export default function CategoryTiles({ categories, products, categorySettings = [] }: {
  categories: string[]; products: Product[]; categorySettings?: CategorySettings[];
}) {
  const seasonal = new Set(categorySettings.filter(category => category.isSeasonal).map(category => category.name));
  const seasonalCategories = categories.filter(category => seasonal.has(category));
  const regularCategories = categories.filter(category => !seasonal.has(category));
  const featuredCategory = seasonalCategories[0];
  const rotatingCategories = featuredCategory
    ? [...seasonalCategories.slice(1), ...regularCategories]
    : (regularCategories.length > 0 ? regularCategories : categories);

  const renderCard = (category: string, isPinned = false, isAboveFold = false) => {
    const candidates = products.filter(product => matchesCategory(product, category, categorySettings));
    if (!candidates.length) return null;
    const settings = categorySettings.find(item => item.name === category);
    const image = getCategoryImage(candidates, settings);
    const isSeasonal = Boolean(settings?.isSeasonal);
    return <a key={category} href={collectionPath(category)}
      className={`${isPinned ? 'w-full block card-seasonal-glow' : isSeasonal ? 'card-seasonal-glow w-[38%] sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]' : 'w-[38%] sm:w-[calc((100%-36px)/4)] lg:w-[calc((100%-60px)/6)]'} min-w-0 shrink-0 snap-start overflow-hidden rounded-xl border border-mustard/40 bg-white hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cocoa`}>
      <img src={getProductImageUrl(image, 480)} srcSet={getProductCardSrcSet(image)}
        sizes="(min-width: 1024px) 180px, (min-width: 640px) 24vw, 38vw"
        alt="" width={480} height={480} loading={isPinned || isAboveFold ? 'eager' : 'lazy'}
        className="aspect-square w-full bg-cream-dark object-contain" {...productImageProtection} />
      <span className={`block break-words p-3 text-center text-sm font-semibold text-cocoa ${isSeasonal ? 'badge-glow bg-mustard/20' : ''}`}>{category}</span>
    </a>;
  };

  const pinned = featuredCategory ? renderCard(featuredCategory, true) : null;

  return <RotatingCarousel
    title="Explore collections"
    label="collection"
    navigation
    viewAll="/collections/"
    itemCount={rotatingCategories.length}
    pinned={pinned}
  >
    {rotatingCategories.map((category, index) => renderCard(category, false, index < 2))}
  </RotatingCarousel>;
}
