import { lazy, Suspense, useState } from 'react';
import type { Product, ProductVariant } from '../types/product';
import { getPublicVariantPrice } from '../utils/productPrice';
import { getProductImageUrl } from '../utils/productImageUrl';
import { toProductPageUrl } from '../utils/productLink';
import { formatINR } from '../utils/currency';
import { productImageProtection } from '../utils/imageProtection';
import CartIconButton from './CartIconButton';

const ProductModal = lazy(() => import('./ProductModal'));

interface Props {
  article: {
    intro: string;
    closing?: string;
    budgetBands: { maximumPrice: number; title: string; text: string }[];
  };
  products: Product[];
  showCatalogue: boolean;
  onAddToCart: (product: Product, variant: ProductVariant) => Promise<boolean>;
  isCartBusy: boolean;
  getCartQuantity: (productId: string) => number;
}

export default function BudgetGiftGuide({ article, products, showCatalogue, onAddToCart, isCartBusy, getCartQuantity }: Props) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selectedProduct = products.find(product => product.id === selectedProductId);
  const priced = showCatalogue ? products.flatMap(product => {
    const prices = (product.variants.length ? product.variants : [undefined])
      .map(variant => getPublicVariantPrice(product, variant))
      .filter((price): price is number => price !== null && Number.isFinite(price));
    return prices.length ? [{ product, low: Math.min(...prices), high: Math.max(...prices) }] : [];
  }).sort((a, b) => a.low - b.low) : [];
  const bands = article.budgetBands.map((band, index) => ({
    ...band,
    minimum: index === 0 ? 0 : article.budgetBands[index - 1].maximumPrice,
    id: `budget-${band.maximumPrice}`,
    items: priced.filter(item => item.low > (index === 0 ? 0 : article.budgetBands[index - 1].maximumPrice)
      && item.low <= band.maximumPrice),
  }));
  const cards = (items: typeof priced) => <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
    {items.map(({ product, low, high }) => <li key={product.id} className="min-w-0 overflow-hidden rounded-2xl border border-cocoa/10 bg-white">
      <a href={toProductPageUrl(product)} aria-label={`View ${product.name}`}
        className="block aspect-square overflow-hidden bg-cream">
        {product.image && <img src={getProductImageUrl(product.image, 480)} alt={product.name}
          width={480} height={480} loading="lazy" decoding="async" {...productImageProtection}
          className="h-full w-full object-contain transition-transform duration-300 hover:scale-105" />}
      </a>
      <div className="space-y-2 p-3 sm:p-4">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-cocoa/55">{product.category}</p>
        <h3 className="min-h-10 text-sm font-semibold leading-5 sm:text-base">
          <a href={toProductPageUrl(product)} className="line-clamp-2 hover:underline">{product.name}</a>
        </h3>
        <div className="flex min-h-11 items-center justify-between gap-1">
          <p className="min-w-0 font-heading text-base font-bold sm:text-lg">{low !== high ? 'From ' : ''}{formatINR(low)}</p>
          <CartIconButton productName={product.name} status="idle" overlay={false}
            onClick={() => setSelectedProductId(product.id)} quantity={getCartQuantity(product.id)}
            disabled={isCartBusy || !product.inStock || !product.variants.some(variant => variant.inStock)} />
        </div>
        <p className="text-xs text-cocoa/60">{product.inStock ? 'Choose colours & add to cart' : 'Currently out of stock'}</p>
      </div>
    </li>)}
  </ul>;
  return <>
    <section aria-label="Find a gift by budget" className="rounded-3xl border border-mustard/40 bg-mustard/10 p-4 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cocoa/65">Thoughtful gifting, made simple</p>
      <p className="mt-3 max-w-2xl leading-relaxed">{article.intro}</p>
      <nav aria-label="Choose a gift budget" className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
        {bands.map(band => <a key={band.id} href={`#${band.id}`}
          className="rounded-2xl border border-cocoa/10 bg-white p-3 transition-colors hover:border-cocoa/40 sm:p-5">
          <span className="block text-xs text-cocoa/60">Up to</span>
          <strong className="mt-1 block font-heading text-xl sm:text-3xl">{formatINR(band.maximumPrice)}</strong>
          {showCatalogue && <span className="mt-2 block text-xs text-cocoa/65">{band.items.length} gift {band.items.length === 1 ? 'idea' : 'ideas'} &rarr;</span>}
        </a>)}
      </nav>
      <p className="mt-4 text-xs leading-relaxed text-cocoa/65">Grouped by starting product price, without repeats. Variant prices may differ. Shipping is separate; review your final checkout total.</p>
    </section>
    {bands.map(band => <section key={band.id} id={band.id} aria-labelledby={`${band.id}-title`} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-cocoa/10 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cocoa/55">{band.minimum === 0 ? `Up to ${formatINR(band.maximumPrice)}` : `Over ${formatINR(band.minimum)}, up to ${formatINR(band.maximumPrice)}`}</p>
          <h2 id={`${band.id}-title`} className="mt-1 font-heading text-2xl font-bold">{band.title}</h2>
        </div>
        {showCatalogue && <span className="rounded-full bg-mustard/15 px-3 py-1 text-xs">{band.items.length} to explore</span>}
      </div>
      <p className="max-w-2xl text-sm text-cocoa/70">{band.text}</p>
      {cards(band.items.slice(0, 6))}
      {band.items.length > 6 && <details className="group">
        <summary className="mx-auto w-fit cursor-pointer rounded-full border border-cocoa/25 px-5 py-3 text-center text-sm font-semibold">
          Show {band.items.length - 6} more {band.items.length === 7 ? 'gift' : 'gifts'} in this range
        </summary>
        <div className="mt-5">{cards(band.items.slice(6))}</div>
      </details>}
      {showCatalogue && band.items.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-cocoa/65">No gifts in this range right now. <a href="/collections/" className="underline">Explore all collections</a>.</p>}
    </section>)}
    <aside className="grid gap-4 rounded-3xl bg-cocoa p-5 text-cream sm:grid-cols-2 sm:p-7">
      <div className="space-y-3">
        <h2 className="font-heading text-xl font-bold">A more personal touch</h2>
        <p className="text-sm leading-relaxed text-cream/85">{article.closing}</p>
        <a href="/about/#contact-luvia" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Ask Luvia about your gift &rarr;</a>
      </div>
      <div className="space-y-3 border-t border-cream/20 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
        <h2 className="font-heading text-xl font-bold">Gifting for a group?</h2>
        <p className="text-sm leading-relaxed text-cream/85">Share your quantity, budget and occasion date. We will confirm options and timing before you order.</p>
        <a href="/bulk-orders/" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Explore bulk gifting &rarr;</a>
      </div>
    </aside>
    {selectedProduct && <Suspense fallback={<p role="status">Loading product details...</p>}>
      <ProductModal key={selectedProduct.id} product={selectedProduct} currentIndex={0} totalProducts={1}
        initialVariantId={[...selectedProduct.variants].sort((a, b) =>
          (getPublicVariantPrice(selectedProduct, a) ?? Infinity) - (getPublicVariantPrice(selectedProduct, b) ?? Infinity))[0]?.id}
        onClose={() => setSelectedProductId(null)} onPrevious={() => {}} onNext={() => {}}
        onAddToCart={onAddToCart} isCartBusy={isCartBusy} />
    </Suspense>}
  </>;
}
