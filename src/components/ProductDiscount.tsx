import type { Product, ProductVariant } from '../types/product';
import { formatINR } from '../utils/currency';
import { getPublicVariantPrice } from '../utils/productPrice';

export default function ProductDiscount({ product, variant }: { product: Product; variant?: ProductVariant | null }) {
  const price = getPublicVariantPrice(product, variant);
  const regular = variant?.price !== null && variant?.price !== undefined
    ? variant.regularPrice : product.regularPrice;
  if (price === null || !regular || regular <= price || !product.discountPercent) return null;
  return <span className="mt-1 block text-xs font-semibold leading-relaxed text-cocoa">
    <del className="font-normal text-cocoa/60">{formatINR(regular)}</del>
    <span className="ml-2 rounded bg-mustard/40 px-1.5 py-0.5">{product.discountPercent}% off</span>
    <span className="block">Save {formatINR(regular - price)} per piece</span>
  </span>;
}
