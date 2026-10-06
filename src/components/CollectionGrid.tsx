import type { CategorySettings, Product } from '../types/product';
import { collectionPath } from '../utils/collectionLink.js';
import { getProductImageUrl } from '../utils/productImageUrl';

interface Props {
  categories: CategorySettings[];
  products: Product[];
}

export default function CollectionGrid({ categories, products }: Props) {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const items = groups.get(product.category) ?? [];
    items.push(product);
    groups.set(product.category, items);
  }

  return <nav aria-label="Explore collections">
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map(category => {
        const items = groups.get(category.name) ?? [];
        if (!items.length) return null;
        const image = items.find(product => product.image)?.image;
        return <li key={category.name}>
          <a href={collectionPath(category.name)} aria-label={category.name}
            className="group block h-full overflow-hidden rounded-2xl border border-mustard/40 bg-mustard/25 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
            <div className="relative aspect-square overflow-hidden bg-cream-dark">
              {image && <img src={getProductImageUrl(image, 480)} alt="" aria-hidden="true" width={480} height={480}
                loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />}
              <img src={image ? getProductImageUrl(image, 480) : '/images/luvia-logo-320.webp'} alt="" width={480} height={480}
                loading="lazy" decoding="async" className="relative h-full w-full object-contain" />
            </div>
            <div className="p-3 sm:p-4">
              <h2 className="font-heading text-lg font-semibold leading-snug group-hover:underline">{category.name}</h2>
              <p className="mt-1 text-sm">{items.length} {items.length === 1 ? 'product' : 'products'}</p>
            </div>
          </a>
        </li>;
      })}
    </ul>
  </nav>;
}
