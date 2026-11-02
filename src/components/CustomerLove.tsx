import { useEffect, useState } from 'react';
import type { Product } from '../types/product';
import { fetchTestimonials, testimonialPhotoUrl, type Testimonial } from '../services/customerLove';
import { toProductPageUrl } from '../utils/productLink';
import RotatingCarousel from './RotatingCarousel';

export function TestimonialCard({ entry, product, imageUrl }: {
  entry: Testimonial; product?: Product; imageUrl?: string;
}) {
  const source = imageUrl ?? testimonialPhotoUrl(entry.id);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageFailed = failedSource === source;
  return <figure className="h-full overflow-hidden rounded-2xl border border-mustard/40 bg-white shadow-sm">
    {entry.has_image && !imageFailed && <img src={source} alt={entry.image_alt}
      loading="lazy" decoding="async" width={480} height={480} onError={() => setFailedSource(source)}
      className="aspect-square w-full object-cover" />}
    <div className="space-y-3 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-cocoa/60">A little love, handmade</p>
      {imageFailed && <p role="status" className="text-xs">Customer photo is currently unavailable.</p>}
      <blockquote className="whitespace-pre-line text-base leading-relaxed text-cocoa">
        &ldquo;{entry.quote}&rdquo;
      </blockquote>
      <figcaption className="text-sm font-semibold text-cocoa">{entry.display_name}</figcaption>
      {product && <a href={toProductPageUrl(product)} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
        Shop {product.name}
      </a>}
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
  const selected = (suppliedEntries ?? entries).filter(entry => productId
    ? entry.product_id === productId : page || entry.featured).sort((a, b) => a.sort_order - b.sort_order);
  if (loading || error) return <section aria-label="Customer Love" className={loading && !page ? 'sr-only' : 'rounded-xl border border-mustard/30 p-4 text-sm'}>
    {loading && <p role="status">Loading Customer Love...</p>}
    {error && <><p role="alert">Customer Love could not be loaded.</p><button type="button" className="min-h-11 underline"
      onClick={() => setRetry(value => value + 1)}>Retry customer stories</button></>}
  </section>;
  if (!selected.length) return page ? <p>Customer stories will appear here once shared with permission.</p> : null;
  const cards = selected.map(entry => <div key={entry.id} className={page ? 'min-w-0' : 'w-[85%] shrink-0 sm:w-[calc((100%-24px)/3)]'}>
    <TestimonialCard entry={entry} product={products.find(product => product.id === entry.product_id)}
      imageUrl={imageUrl?.(entry)} />
  </div>);
  return page ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
    : <RotatingCarousel title="Customer Love" label="customer story" itemCount={selected.length} viewAll="/customer-love/"
      description="Little moments of joy, shared by our customers with permission.">{cards}</RotatingCarousel>;
}
