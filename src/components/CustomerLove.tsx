import { useEffect, useState } from 'react';
import type { Product } from '../types/product';
import { fetchTestimonials, type Testimonial } from '../services/customerLove';
import { toProductPageUrl } from '../utils/productLink';
import RotatingCarousel from './RotatingCarousel';
import { productImageProtection } from '../utils/imageProtection';
import { findTestimonialBySlug, testimonialPath } from '../utils/testimonialLink';
import { getCustomerStoryWhatsAppLink } from '../utils/whatsapp';

/** Splits an approved display name like "Shalini, Meerut" into a name and a subtle location label. */
export const splitDisplayName = (displayName: string) => {
  const index = displayName.indexOf(',');
  if (index < 0) return { name: displayName.trim(), location: '' };
  return { name: displayName.slice(0, index).trim(), location: displayName.slice(index + 1).trim() };
};

const StoryAttribution = ({ entry }: { entry: Testimonial }) => {
  const { name, location } = splitDisplayName(entry.display_name);
  return <figcaption className="text-sm">
    <span className="font-semibold">{name}</span>
    {location && <><span className="sr-only">, </span><span aria-hidden="true" className="text-cocoa/70"> · </span>
      <span className="text-cocoa/70">{location}</span></>}
  </figcaption>;
};

const ShopLinks = ({ products }: { products: Product[] }) => products.length > 0
  ? <div className="flex flex-wrap gap-x-4">{products.map(product => <a key={product.id} href={toProductPageUrl(product)}
    className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-wide underline-offset-4 hover:underline">
    <span>Shop {product.name}<span aria-hidden="true">&nbsp;→</span></span>
  </a>)}</div> : null;

const ReadStoryLink = ({ entry }: { entry: Testimonial }) => <a href={testimonialPath(entry)}
  aria-label={`Read full story from ${entry.display_name}`}
  className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Read full story</a>;

const storyPhoto = (entry: Testimonial, source: string | undefined, className: string, eager = false) => entry.has_image && source
  ? <img src={source} alt={entry.image_alt} loading={eager ? 'eager' : 'lazy'} decoding="async" width={480} height={480}
    className={className} {...productImageProtection} /> : null;

/** Large photo-first hero for the lead story on /customer-love/. */
function FeaturedStory({ entry, products, imageUrl }: { entry: Testimonial; products: Product[]; imageUrl?: string }) {
  const photo = storyPhoto(entry, imageUrl ?? entry.image_url ?? undefined, 'h-auto max-h-[36rem] w-full bg-cream object-contain', true);
  return <figure id={`testimonial-${entry.id}`} tabIndex={-1}
    className={`grid scroll-mt-24 overflow-hidden rounded-3xl border border-mustard/40 bg-white shadow-sm ${photo ? 'md:grid-cols-5' : ''}`}>
    {photo && <div className="flex items-center justify-center bg-cream md:col-span-3">{photo}</div>}
    <div className={`flex flex-col justify-center gap-4 p-6 sm:p-8 ${photo ? 'md:col-span-2' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cocoa/70">Featured story</p>
      <blockquote className="line-clamp-6 whitespace-pre-line font-heading text-2xl leading-snug sm:text-3xl">&ldquo;{entry.quote}&rdquo;</blockquote>
      <StoryAttribution entry={entry} />
      <ShopLinks products={products} />
      <ReadStoryLink entry={entry} />
    </div>
  </figure>;
}

/** Masonry gallery card: photos lead when available, text-only stories get a softer quote card. */
function GalleryStory({ entry, products, imageUrl }: { entry: Testimonial; products: Product[]; imageUrl?: string }) {
  const photo = storyPhoto(entry, imageUrl ?? entry.image_url ?? undefined, 'h-auto w-full bg-cream object-contain');
  return <figure id={`testimonial-${entry.id}`} tabIndex={-1}
    className={`mb-5 break-inside-avoid scroll-mt-24 overflow-hidden rounded-2xl border border-mustard/40 shadow-sm ${photo ? 'bg-white' : 'bg-cream-dark'}`}>
    {photo}
    <div className="space-y-2 p-5">
      {!photo && <p aria-hidden="true" className="font-heading text-3xl leading-none text-mustard-dark">♡</p>}
      <blockquote className={`line-clamp-3 whitespace-pre-line break-words ${photo ? 'text-base' : 'font-heading text-xl'} leading-relaxed`}>&ldquo;{entry.quote}&rdquo;</blockquote>
      <StoryAttribution entry={entry} />
      <ShopLinks products={products} />
      <ReadStoryLink entry={entry} />
    </div>
  </figure>;
}

const hasPhoto = (entry: Testimonial) => entry.has_image && Boolean(entry.image_url);

/** Picks up to three homepage stories, rotating daily through featured stories, with a photo story leading. */
export const pickHomeStories = (featured: Testimonial[], day = Math.floor(Date.now() / 86400000)) => {
  const start = featured.length > 3 ? day % featured.length : 0;
  const chosen = [...featured.slice(start), ...featured.slice(0, start)].slice(0, 3);
  const lead = chosen.find(hasPhoto) ?? chosen[0];
  return lead ? [lead, ...chosen.filter(entry => entry !== lead)] : [];
};

/** Compact homepage testimonial: a photo-led lead story and short quote cards; swipeable on mobile. */
function HomeStory({ entry, products, imageUrl, lead }: { entry: Testimonial; products: Product[]; imageUrl?: string; lead: boolean }) {
  // Mobile: every card is photo-on-top. Desktop: the lead keeps a large photo, others use a side thumbnail.
  const photo = storyPhoto(entry, imageUrl ?? entry.image_url ?? undefined, lead
    ? 'h-56 w-full shrink-0 bg-cream object-contain md:h-80'
    : 'h-56 w-full shrink-0 bg-cream object-contain md:h-24 md:w-24 md:rounded-xl');
  return <figure className={`relative flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-mustard/40 bg-white shadow-sm md:w-auto ${
    lead ? 'md:row-span-2' : 'md:flex-row md:items-start md:gap-4 md:p-5'}`}>
    {photo}
    <div className={`flex min-w-0 flex-1 flex-col p-5 ${lead ? '' : 'md:p-0'}`}>
      <div className="min-w-0 space-y-2">
        <blockquote className={`whitespace-pre-line break-words ${lead ? 'line-clamp-4 font-heading text-xl leading-snug sm:text-2xl'
          : 'line-clamp-3 leading-relaxed'}`}>&ldquo;{entry.quote}&rdquo;</blockquote>
        <StoryAttribution entry={entry} />
        <div className="flex flex-wrap items-center gap-x-4">
          <ShopLinks products={products.slice(0, 2)} />
          <ReadStoryLink entry={entry} />
        </div>
      </div>
    </div>
  </figure>;
}

function LovedByYou({ stories, tagged, imageUrl }: {
  stories: Testimonial[]; tagged: (entry: Testimonial) => Product[]; imageUrl?: (entry: Testimonial) => string;
}) {
  return <section aria-labelledby="loved-by-you-heading" className="space-y-6">
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cocoa/70">A little love goes a long way</p>
      <h2 id="loved-by-you-heading" className="mt-2 font-heading text-3xl font-bold">Loved by You <span aria-hidden="true">♡</span></h2>
      <p className="mt-1 text-cocoa/80">Real stories from our happy customers</p>
    </div>
    <div aria-label="Customer stories" role="region" tabIndex={0}
      className={`relative -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 ${
        stories.length > 1 ? 'md:grid-cols-2' : 'md:mx-auto md:max-w-xl'}`}>
      {stories.map((entry, index) => <HomeStory key={entry.id} entry={entry} products={tagged(entry)}
        imageUrl={imageUrl?.(entry)} lead={index === 0} />)}
    </div>
    <p className="text-center text-sm">Every creation has a story.{' '}
      <a href="/customer-love/" className="inline-flex min-h-11 items-center font-semibold uppercase tracking-wide underline underline-offset-4">
        Read more customer stories<span aria-hidden="true">&nbsp;→</span></a></p>
  </section>;
}

const ShareStory = () => <section aria-labelledby="share-story-heading"
  className="rounded-3xl bg-cream-dark px-6 py-10 text-center">
  <h2 id="share-story-heading" className="font-heading text-2xl font-bold">Have a Luvia story to share?</h2>
  <p className="mx-auto mt-2 max-w-md">Your love keeps our little handmade world growing. We only publish stories and photos with your permission.</p>
  <a href={getCustomerStoryWhatsAppLink()} target="_blank" rel="noopener noreferrer"
    className="mt-5 inline-flex min-h-11 items-center rounded-full bg-cocoa px-6 py-2 font-semibold text-cream">Share your experience</a>
</section>;

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
        onError={() => setFailedSource(source)} className="h-auto w-full bg-cream object-contain" {...productImageProtection} />
      : <div className="relative h-56 shrink-0 overflow-hidden bg-cream">
        <img src={source} alt="" aria-hidden="true" loading="lazy" decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" {...productImageProtection} />
        <img src={source} alt={entry.image_alt} loading="lazy" decoding="async" width={480} height={480}
          onError={() => setFailedSource(source)} className="relative h-full w-full object-contain" {...productImageProtection} />
      </div>)}
    <div className={fullQuote ? 'space-y-3 p-5' : 'flex min-h-0 flex-1 flex-col gap-2 p-4'}>
      {imageFailed && <p role="status" className="text-xs">Customer photo is currently unavailable.</p>}
      {!fullQuote ? <a href={testimonialPath(entry)}
        aria-label={`Read full testimonial from ${entry.display_name}`}
        className="block min-h-0 overflow-hidden">
        {quote}
        <span className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Read full testimonial</span>
      </a> : quote}
      <figcaption className={`${fullQuote ? '' : 'shrink-0 truncate leading-6 '}text-sm font-semibold text-cocoa`}>{entry.display_name}</figcaption>
      {products.length > 0 && <div className={fullQuote ? 'flex flex-wrap gap-x-4' : 'mt-auto flex shrink-0 gap-4 overflow-x-auto'}>{products.map(product => <a key={product.id} href={toProductPageUrl(product)} className={`${fullQuote ? '' : 'shrink-0 whitespace-nowrap '}inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4`}>
        Shop {product.name}
      </a>)}</div>}
    </div>
  </figure>;
}

export default function CustomerLove({ products, productId, page = false, storySlug, onStoryResolved, entries: suppliedEntries, imageUrl, onContentReady }: {
  products: Product[]; productId?: string; page?: boolean; entries?: Testimonial[];
  /** Renders only the published story at /customer-love/<slug>/. */
  storySlug?: string;
  onStoryResolved?: (entry: Testimonial | null) => void;
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
  const available = suppliedEntries ?? entries;
  const story = storySlug === undefined ? undefined : findTestimonialBySlug(available, storySlug) ?? null;
  useEffect(() => {
    if (storySlug !== undefined && !loading && !error) onStoryResolved?.(story ?? null);
  }, [storySlug, loading, error, story, onStoryResolved]);
  const selected = available.filter(entry => productId
    ? entry.product_ids.includes(productId) : page || entry.featured).sort((a, b) => a.sort_order - b.sort_order);
  if (loading || error) return <section aria-label="Customer Love" className={loading && !page && storySlug === undefined ? 'sr-only' : 'rounded-xl border border-mustard/30 p-4 text-sm'}>
    {loading && <p role="status">Loading Customer Love...</p>}
    {error && <><p role="alert">Customer Love could not be loaded.</p><button type="button" className="min-h-11 underline"
      onClick={() => setRetry(value => value + 1)}>Retry customer stories</button></>}
  </section>;
  if (storySlug !== undefined) return <div className="space-y-10"><div className="max-w-2xl space-y-4">
    {story ? <TestimonialCard entry={story} products={products.filter(product => story.product_ids.includes(product.id))}
      imageUrl={imageUrl?.(story)} fullQuote />
      : <p role="status">This customer story is no longer available.</p>}
    <a href="/customer-love/" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">See all customer stories</a>
  </div><ShareStory /></div>;
  if (!selected.length) return page ? <div className="space-y-10"><p>Customer stories will appear here once shared with permission.</p><ShareStory /></div> : null;
  const tagged = (entry: Testimonial) => products.filter(product => entry.product_ids.includes(product.id));
  if (page) {
    const lead = selected.find(entry => entry.featured && entry.has_image && entry.image_url)
      ?? selected.find(entry => entry.has_image && entry.image_url) ?? selected[0];
    const rest = selected.filter(entry => entry !== lead);
    return <div className="space-y-10">
      <FeaturedStory entry={lead} products={tagged(lead)} imageUrl={imageUrl?.(lead)} />
      {rest.length > 0 && <div className="columns-1 gap-5 sm:columns-2">
        {rest.map(entry => <GalleryStory key={entry.id} entry={entry} products={tagged(entry)} imageUrl={imageUrl?.(entry)} />)}
      </div>}
      <ShareStory />
    </div>;
  }
  if (!productId) return <LovedByYou stories={pickHomeStories(selected)} tagged={tagged} imageUrl={imageUrl} />;
  const cards = selected.map(entry => <div key={entry.id} className="w-[85%] shrink-0 sm:w-[calc((100%-24px)/3)]">
    <TestimonialCard entry={entry} products={tagged(entry)} imageUrl={imageUrl?.(entry)} />
  </div>);
  return <RotatingCarousel title="Customer Love" label="customer story" itemCount={selected.length} viewAll="/customer-love/"
    description="Made with love. Loved in real life.">{cards}</RotatingCarousel>;
}
