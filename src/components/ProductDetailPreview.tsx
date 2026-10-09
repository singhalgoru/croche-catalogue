import type { Product } from '../types/product';
import { getProductImageUrl } from '../utils/productImageUrl';
import ProductDetails from './ProductDetails';
import { findProductVariantByReference } from '../utils/productLink';

export default function ProductDetailPreview({ product, variantReference }: { product: Product; variantReference?: string }) {
  const variant = variantReference ? findProductVariantByReference(product, variantReference) : undefined;
  return (
    <section aria-label={`${product.name} details`} aria-busy="true"
      className="grid gap-5 rounded-2xl bg-white p-4 sm:p-6 md:grid-cols-2">
      <img src={getProductImageUrl(variant?.image || product.image, 960)} alt={product.name}
        width={960} height={960} fetchPriority="high"
        className="aspect-square w-full rounded-xl object-contain" />
      <div className="space-y-4 text-cocoa">
        <p className="text-sm">{product.category}</p>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">{product.name}</h1>
        <p className="whitespace-pre-line">{product.description}</p>
        <ProductDetails product={product} />
        <p role="status" className="text-sm text-cocoa/70">Preparing interactive photo and shopping controls…</p>
      </div>
    </section>
  );
}
