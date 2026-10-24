import type { Product } from '../types/product';
import { useBestsellerIds } from '../hooks/useBestsellerIds';
import { getBestsellerProducts, productCollections } from '../utils/productCollections.js';
import ProductCarousel from './ProductCarousel';

export default function Bestsellers({ products, onSelect, initialIds = [] }: {
  products: Product[]; onSelect: (product: Product) => void; initialIds?: string[];
}) {
  const { ids } = useBestsellerIds(initialIds);
  const ranked = getBestsellerProducts(products, ids);
  if (ranked.length < 2) return null;
  const collection = productCollections[0];
  return <ProductCarousel products={ranked} onSelect={onSelect} title={collection.title}
    label="bestseller" viewAll={collection.path} description={collection.description} />;
}
