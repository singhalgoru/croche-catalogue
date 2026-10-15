import type { Product, ProductVariant } from '../types/product';
import { formatINR } from '../utils/currency';
import { getProductDiscount } from '../utils/productPrice';

export default function ProductDiscount({ product, variant }: { product: Product; variant?: ProductVariant | null }) {
  const discount = getProductDiscount(product, variant);
  if (!discount) return null;
  return <span className="mt-2 block text-xs font-semibold leading-relaxed text-cocoa">
    <del className="font-normal text-cocoa/60">{formatINR(discount.regular)}</del>
    <span className="ml-2 inline-block rounded-full bg-cocoa px-3 py-1 text-sm font-bold uppercase tracking-wide text-cream">{discount.percent}% off</span>
    <span className="mt-1 block font-bold">Save {formatINR(discount.saving)} per piece</span>
  </span>;
}
