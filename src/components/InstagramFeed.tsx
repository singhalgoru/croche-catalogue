import { useEffect, useState } from 'react';
import { fetchInstagramFeed } from '../services/instagramFeed';
import type { InstagramFeed as InstagramFeedData } from '../../supabase/functions/_shared/instagramFeed';
import type { Product } from '../types/product';
import { toProductPageUrl } from '../utils/productLink';
import { InstagramIcon } from './SocialIcons';
import RotatingCarousel from './RotatingCarousel';

const cleanCaption = (value: string) => value
  .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u200D]/gu, '')
  .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
  .replace(/^[’']s\b\s*/u, '')
  .replace(/\s+/g, ' ')
  .trim();

const productNameForCaption = (caption: string) => {
  const normalized = cleanCaption(caption).toLowerCase();
  if (/\bevil eye charm\b/.test(normalized)) return 'Evil Eye Charm (Bag / Key / Car)';
  if (/\bdumpling\b/.test(normalized) && /\bclutch\b/.test(normalized)) return 'Chunky Dumpling Clutch Bag';
  if (/\bheadband\b/.test(normalized)) return 'Mustard Scalloped Headband';
  return null;
};

export default function InstagramFeed({ products = [] }: { products?: Product[] }) {
  const [feed, setFeed] = useState<InstagramFeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchInstagramFeed().then(value => {
      if (active) setFeed(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const profileUrl = feed
    ? `https://www.instagram.com/${feed.username}/`
    : 'https://www.instagram.com/luviacreations/';

  const status = feed?.stale
    ? <p role="status">Showing saved posts while Instagram is temporarily unavailable.</p>
    : loading
      ? <p role="status">Loading recent Instagram posts…</p>
      : error
        ? <p role="alert">Recent posts are temporarily unavailable. You can still visit Luvia on Instagram.</p>
        : feed?.posts.length === 0
          ? <p>No posts from the last 30 days yet. Follow along on Instagram for new handmade pieces.</p>
          : null;

  return <RotatingCarousel
    title="From Instagram"
    label="Instagram post"
    itemCount={feed?.posts.length ?? 0}
    description={<div className="space-y-1">
      <p className="font-semibold text-sm text-cocoa">@{feed?.username ?? 'luviacreations'}</p>
      {status}
    </div>}
    className="mt-10 rounded-3xl border border-mustard/40 bg-white p-5 sm:mt-14 sm:p-7"
    headerAction={<a href={profileUrl} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream hover:bg-cocoa-dark">
      <InstagramIcon className="h-4 w-4" /> Follow Luvia
    </a>}
    scrollSnap
    showPosition
  >
    {feed?.posts.map(post => {
        const mediaDescription = post.mediaType === 'VIDEO' ? 'video' : post.mediaType === 'CAROUSEL_ALBUM' ? 'photo carousel' : 'photo';
        const caption = cleanCaption(post.caption);
        const summary = caption.slice(0, 180);
        const productName = productNameForCaption(post.caption);
        const product = productName
          ? products.find(item => item.name.toLowerCase() === productName.toLowerCase() && item.inStock)
          : undefined;
        const alt = summary
          ? `Instagram ${mediaDescription} from @${feed.username}: ${summary}${caption.length > summary.length ? '…' : ''}`
          : `Instagram ${mediaDescription} from @${feed.username}`;
        return <div key={post.id} className="w-[76%] min-w-0 shrink-0 snap-start sm:w-[calc((100%-24px)/3)] lg:w-[calc((100%-36px)/4)]">
          <a href={post.permalink} target="_blank" rel="noopener noreferrer"
            aria-label={`View ${mediaDescription} from @${feed.username} on Instagram${summary ? `: ${summary}` : ''}`}
            className={`group relative block aspect-[4/5] overflow-hidden rounded-xl ${post.mediaType === 'CAROUSEL_ALBUM' ? 'bg-cocoa' : 'bg-cream-dark'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa`}>
            <img src={post.previewUrl} alt={alt} loading="lazy" decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-75 group-focus-visible:brightness-75" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-cocoa/45 text-center text-sm font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="flex items-center gap-2"><InstagramIcon className="h-5 w-5" /> View post</span>
            </span>
            {post.mediaType !== 'IMAGE' && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-cocoa/85 text-cream shadow" aria-hidden="true">
              {post.mediaType === 'VIDEO'
                ? <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5.5v13l10-6.5z" /></svg>
                : <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></svg>}
            </span>}
          </a>
          {caption && <div className="mt-2 line-clamp-2 text-sm leading-snug text-cocoa"><p className="font-semibold">{caption}</p></div>}
          <time dateTime={post.timestamp} className="mt-1 block text-[11px] text-cocoa/70">
            {new Date(post.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </time>
          {product && <a href={toProductPageUrl(product)} className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-cocoa underline underline-offset-2">
            Shop this{product.showPrice !== false && product.price !== null ? ` ₹${product.price}` : ''} →
          </a>}
        </div>;
      })}
  </RotatingCarousel>;
}
