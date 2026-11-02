import { useEffect, useState } from 'react';
import type { Product } from '../types/product';
import { fetchTestimonials, type Testimonial } from '../services/customerLove';
import { toProductPageUrl } from '../utils/productLink';
import RotatingCarousel from './RotatingCarousel';

export function TestimonialCard({ entry, products = [], imageUrl, fullQuote = false }: {
  entry: Testimonial; products?: Product[]; imageUrl?: string; fullQuote?: boolean;
}) {
  const source = imageUrl ?? entry.image_url;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageFailed = failedSource === source;
  const characters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(entry.quote), part => part.segment);
  const shortened = !fullQuote && characters.length > 240;
  const quote = <blockquote className={fullQuote ? 'whitespace-pre-line text-base leading-relaxed text-cocoa'
    : 'line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-cocoa'}>
    &ldquo;{shortened ? `${characters.slice(0, 240).join('').trimEnd()}...` : entry.quote}&rdquo;
  </blockquote>;
  return <figure id={fullQuote ? `testimonial-${entry.id}` : undefined} tabIndex={fullQuote ? -1 : undefined}
    className={`${fullQuote ? 'h-full' : 'flex h-[30rem] flex-col'} scroll-mt-24 overflow-hidden rounded-2xl border border-mustard/40 bg-white shadow-sm`}>
    {entry.has_image && source && !imageFailed && (fullQuote
      ? <img src={source} alt={entry.image_alt} loading="lazy" decoding="async" width={480} height={480}
        onError={() => setFailedSource(source)} className="h-auto w-full bg-cream object-contain" />
      : <div className="relative h-56 shrink-0 overflow-hidden bg-cream">
        <img src={source} alt="" aria-hidden="true" loading="lazy" decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
        <img src={source} alt={entry.image_alt} loading="lazy" decoding="async" width={480} height={480}
          onError={() => setFailedSource(source)} className="relative h-full w-full object-contain" />
      </div>)}
    <div className={fullQuote ? 'space-y-3 p-5' : 'flex min-h-0 flex-1 flex-col gap-2 p-4'}>
      <p className="text-xs font-semibold uppercase tracking-widest text-cocoa/60">A little love, handmade</p>
      {imageFailed && <p role="status" className="text-xs">Customer photo is currently unavailable.</p>}
      {!fullQuote ? <a href={`/customer-love/#testimonial-${encodeURIComponent(entry.id)}`}
        aria-label={`Read full testimonial from ${entry.display_name}`}
        className="block">
        {quote}
        <span className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Read full testimonial</span>
      </a> : quote}
      <figcaption className={`${fullQuote ? '' : 'truncate '}text-sm font-semibold text-cocoa`}>{entry.display_name}</figcaption>
      {products.length > 0 && <div className={fullQuote ? 'flex flex-wrap gap-x-4' : 'mt-auto flex shrink-0 gap-4 overflow-x-auto'}>{products.map(product => <a key={product.id} href={toProductPageUrl(product)} className={`${fullQuote ? '' : 'shrink-0 whitespace-nowrap '}inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4`}>
        Shop {product.name}
      </a>)}</div>}
    </div>
  </figure>;
}

export default function CustomerLove({ products, productId, page = false, entries: suppliedEntries, imageUrl, onContentReady }: {
  products: Product[]; productId?: string; page?: boolean; entries?: Testimonial[];
  imageUrl?: (entry: Testimonial) => string;
  onContentReady?: () => void;
}) {
  const [entries, setEntries] = useState<Testimonial[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(suppliedEntries === undefined);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (suppliedEntries !== undefined) return;
    let current = true;
    setLoading(true); setError('');
    fetchTestimonials().then(result => { if (current) setEntries(result); }, failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to load Customer Love.');
    }).finally(() => { if (current) { setLoading(false); onContentReady?.(); } });
    return () => { current = false; };
  }, [suppliedEntries, retry, onContentReady]);
  useEffect(() => {
    if (!page || loading || error || !location.hash.startsWith('#testimonial-')) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }); }
  }, [page, loading, error, entries, suppliedEntries]);
  const selected = (suppliedEntries ?? entries).filter(entry => productId
    ? entry.product_ids.includes(productId) : page || entry.featured).sort((a, b) => a.sort_order - b.sort_order);
  if (loading || error) return <section aria-label="Customer Love" className={loading && !page ? 'sr-only' : 'rounded-xl border border-mustard/30 p-4 text-sm'}>
    {loading && <p role="status">Loading Customer Love...</p>}
    {error && <><p role="alert">Customer Love could not be loaded.</p><button type="button" className="min-h-11 underline"
      onClick={() => setRetry(value => value + 1)}>Retry customer stories</button></>}
  </section>;
  if (!selected.length) return page ? <p>Customer stories will appear here once shared with permission.</p> : null;
  const cards = selected.map(entry => <div key={entry.id} className={page ? 'min-w-0' : 'w-[85%] shrink-0 sm:w-[calc((100%-24px)/3)]'}>
    <TestimonialCard entry={entry} products={products.filter(product => entry.product_ids.includes(product.id))}
      imageUrl={imageUrl?.(entry)} fullQuote={page} />
  </div>);
  return page ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
    : <RotatingCarousel title="Customer Love" label="customer story" itemCount={selected.length} viewAll="/customer-love/"
      description="Made with love. Loved in real life.">{cards}</RotatingCarousel>;
}
