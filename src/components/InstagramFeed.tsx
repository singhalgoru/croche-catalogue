import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInstagramFeed, readInstagramSnapshot } from '../services/instagramFeed';
import { instagramHomepagePostLimit, type InstagramFeed as InstagramFeedData } from '../../supabase/functions/_shared/instagramFeed';
import { instagramProductIds } from '../../supabase/functions/_shared/instagramProductIds';
import { trackEvent } from '../services/analytics';
import type { Product } from '../types/product';
import { toProductPageUrl } from '../utils/productLink';
import { InstagramIcon, ShareIcon } from './SocialIcons';
import RotatingCarousel from './RotatingCarousel';

const cleanCaption = (value: string) => value
  .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u200D]/gu, '')
  .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
  .replace(/^[’']s\b\s*/u, '')
  .replace(/\s+/g, ' ')
  .trim();

const compactCount = (value: number) => new Intl.NumberFormat('en-IN', {
  notation: 'compact', maximumFractionDigits: 1,
}).format(value);

const fullCount = (value: number) => new Intl.NumberFormat('en-IN').format(value);

export default function InstagramFeed({ products = [], presentation = 'carousel' }: {
  products?: Product[];
  presentation?: 'carousel' | 'gallery';
}) {
  const [feed, setFeed] = useState<InstagramFeedData | null>(() => presentation === 'gallery' ? readInstagramSnapshot() : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharingPostId, setSharingPostId] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ postId: string; message: string; error?: boolean } | null>(null);
  const gallerySection = useRef<HTMLElement>(null);
  const galleryViewTracked = useRef(false);

  useEffect(() => {
    let active = true;
    void fetchInstagramFeed().then(value => {
      if (active) setFeed(current => {
        if (value.stale && current?.posts.length) return current;
        if (!current?.stale) return value;
        return {
          ...value,
          posts: value.posts.map(post => {
            const saved = current.posts.find(item => item.id === post.id && item.permalink === post.permalink);
            return saved ? { ...post, previewUrl: saved.previewUrl } : post;
          }),
        };
      });
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
  const posts = presentation === 'gallery'
    ? feed?.posts ?? []
    : feed?.posts.slice(0, instagramHomepagePostLimit) ?? [];
  const trackFeedView = useCallback((location: 'homepage' | 'instagram_page') => {
    if (feed?.posts.length) {
      trackEvent('instagram_feed_view', {
        post_count: posts.length,
        instagram_username: feed.username,
        stale: feed.stale,
        location,
      });
    }
  }, [feed, posts.length]);
  const onHomepageView = useCallback(() => trackFeedView('homepage'), [trackFeedView]);
  useEffect(() => {
    if (presentation !== 'gallery' || !posts.length || galleryViewTracked.current
      || typeof IntersectionObserver === 'undefined') return;
    const section = gallerySection.current;
    if (!section) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        galleryViewTracked.current = true;
        trackFeedView('instagram_page');
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [presentation, posts.length, trackFeedView]);

  const status = feed?.stale
    ? <p role="status">{loading ? 'Showing saved posts while loading the latest from Instagram.' : 'Showing saved posts while Instagram is temporarily unavailable.'}</p>
    : loading
      ? <p role="status">Loading recent Instagram posts…</p>
      : error
        ? <p role="alert">Recent posts are temporarily unavailable. You can still visit Luvia on Instagram.</p>
        : feed?.posts.length === 0
          ? <p>No posts from the last 30 days yet. Follow along on Instagram for new handmade pieces.</p>
          : null;

  const cards = posts.map(post => {
        const mediaDescription = post.mediaType === 'VIDEO' ? 'video' : post.mediaType === 'CAROUSEL_ALBUM' ? 'photo carousel' : 'photo';
        const caption = cleanCaption(post.caption);
        const summary = caption.slice(0, 180);
        const productId = post.productId ?? instagramProductIds[post.id];
        const product = productId
          ? products.find(item => item.id === productId && item.inStock)
          : undefined;
        const engagement = [
          post.likesCount !== undefined ? `${fullCount(post.likesCount)} likes` : '',
          post.viewsCount !== undefined ? `${fullCount(post.viewsCount)} views` : '',
        ].filter(Boolean).join(', ');
        const alt = summary
          ? `Instagram ${mediaDescription} from @${feed?.username ?? 'luviacreations'}: ${summary}${caption.length > summary.length ? '…' : ''}`
          : `Instagram ${mediaDescription} from @${feed?.username ?? 'luviacreations'}`;
        const sharePost = async (button: HTMLButtonElement, releaseFocus: boolean) => {
          setShareFeedback(null);
          setSharingPostId(post.id);
          let method: 'native' | 'copy_link' | undefined;
          try {
            if (typeof navigator.share === 'function') {
              try {
                await navigator.share({
                  title: `${feed?.username ?? 'luviacreations'} on Instagram`,
                  text: `See this post from @${feed?.username ?? 'luviacreations'} on Instagram.`,
                  url: post.permalink,
                });
                method = 'native';
              } catch (failure) {
                if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'AbortError') return;
                if (!navigator.clipboard?.writeText) throw failure;
                await navigator.clipboard.writeText(post.permalink);
                method = 'copy_link';
              }
            } else if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(post.permalink);
              method = 'copy_link';
            } else {
              setShareFeedback({
                postId: post.id,
                message: 'Sharing is unavailable in this browser. Open the post and copy its address to share.',
                error: true,
              });
              return;
            }
            if (method) {
              trackEvent('instagram_post_share', { instagram_media_id: post.id, method });
              setShareFeedback({
                postId: post.id,
                message: method === 'copy_link' ? 'Instagram post link copied.' : 'Instagram post shared.',
              });
            }
          } catch {
            setShareFeedback({
              postId: post.id,
              message: 'Unable to share this post. Open it and copy its address to share.',
              error: true,
            });
          } finally {
            setSharingPostId(null);
            if (releaseFocus && document.activeElement === button) button.blur();
          }
        };
        return <div key={post.id} className={`relative min-w-0 ${presentation === 'carousel' ? 'w-[82%] shrink-0 snap-start sm:w-[calc((100%-24px)/3)] lg:w-[calc((100%-36px)/4)]' : ''}`}>
          <a href={post.permalink} target="_blank" rel="noopener noreferrer"
            aria-label={`View ${mediaDescription} from @${feed?.username ?? 'luviacreations'} on Instagram${summary ? `: ${summary}` : ''}${engagement ? `, ${engagement}` : ''}`}
            onClick={() => trackEvent('instagram_post_click', {
              instagram_media_id: post.id,
              media_type: post.mediaType,
              has_shop_link: Boolean(product),
              ...(post.likesCount !== undefined ? { like_count: post.likesCount } : {}),
              ...(post.viewsCount !== undefined ? { view_count: post.viewsCount } : {}),
            })}
            className={`group relative block aspect-[4/5] overflow-hidden rounded-xl ${post.mediaType === 'CAROUSEL_ALBUM' ? 'bg-cocoa' : 'bg-cream-dark'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa`}>
            <img src={post.previewUrl} alt={alt} width="480" height="600" loading="lazy" decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-75 group-focus-visible:brightness-75" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-cocoa/45 text-center text-sm font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="flex items-center gap-2"><InstagramIcon className="h-5 w-5" /> View post</span>
            </span>
            {post.mediaType !== 'IMAGE' && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-cocoa/85 text-cream shadow" aria-hidden="true">
              {post.mediaType === 'VIDEO'
                ? <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5.5v13l10-6.5z" /></svg>
                : <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></svg>}
            </span>}
            {(post.likesCount !== undefined || post.viewsCount !== undefined) && <span
              className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-white shadow backdrop-blur-sm"
              aria-hidden="true">
              {post.likesCount !== undefined && <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-rose-400" aria-hidden="true">
                  <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.97 5.97 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.51L12 21.35z" />
                </svg>
                {compactCount(post.likesCount)}
              </span>}
              {post.viewsCount !== undefined && <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current text-amber-100" strokeWidth="1.8" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {compactCount(post.viewsCount)}
              </span>}
            </span>}
          </a>
          {caption && <div className="mt-2 line-clamp-2 text-sm leading-snug text-cocoa"><p className="font-semibold">{caption}</p></div>}
          <div className="flex items-center justify-between gap-2">
            <time dateTime={post.timestamp} className="mt-1 block text-[11px] text-cocoa/70">
              {new Date(post.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </time>
            <button type="button" aria-label="Share this Instagram post" title="Share this Instagram post"
              disabled={sharingPostId === post.id} onClick={event => void sharePost(event.currentTarget, event.detail > 0)}
              className={`group flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50 ${presentation === 'carousel' ? 'sm:absolute sm:left-2 sm:top-2 sm:z-20' : 'absolute left-2 top-2 z-20'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors sm:h-11 sm:w-11 ${presentation === 'carousel' ? 'border-cocoa/20 text-cocoa group-hover:bg-cream-dark sm:border-white/70 sm:bg-cocoa/95 sm:text-white sm:shadow-lg sm:backdrop-blur-md sm:group-hover:bg-cocoa-dark' : 'border-white/70 bg-cocoa/95 text-white shadow-lg backdrop-blur-md group-hover:bg-cocoa-dark'}`}>
                <ShareIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
            </button>
          </div>
          {product && <a href={toProductPageUrl(product)} onClick={() => trackEvent('instagram_shop_click', {
            instagram_media_id: post.id,
            item_id: product.id,
            item_name: product.name,
            item_category: product.category,
            ...(product.showPrice !== false && product.price !== null ? { currency: 'INR', value: product.price } : {}),
          })} className={`mt-1 inline-flex items-center text-xs font-semibold text-cocoa underline underline-offset-2 ${presentation === 'carousel' ? 'min-h-11 sm:min-h-8' : 'min-h-8'}`}>
            Shop this{product.showPrice !== false && product.price !== null ? ` ₹${product.price}` : ''} →
          </a>}
          {shareFeedback?.postId === post.id && <p role={shareFeedback.error ? 'alert' : 'status'} className="mt-1 text-[11px] text-cocoa/80">
            {shareFeedback.message}
          </p>}
        </div>;
      });

  const followLink = <a href={profileUrl} target="_blank" rel="noopener noreferrer"
    onClick={() => trackEvent('instagram_follow_click', {
      instagram_username: feed?.username ?? 'luviacreations',
      location: presentation === 'gallery' ? 'instagram_page' : 'homepage_instagram_feed',
    })}
    className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream hover:bg-cocoa-dark">
    <InstagramIcon className="h-4 w-4 shrink-0" /> Follow Luvia
  </a>;

  if (presentation === 'gallery') {
    return <section ref={gallerySection} aria-label="Instagram post gallery" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-sm text-cocoa">@{feed?.username ?? 'luviacreations'}</p>
          <p className="text-sm text-cocoa/75">Recent posts from the last 30 days</p>
          {status}
        </div>
        {followLink}
      </div>
      {cards.length > 0 && <div role="group" aria-label="Recent Instagram posts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {cards}
      </div>}
    </section>;
  }

  return <RotatingCarousel
    title="From Instagram"
    titleIcon={<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(45deg,#feda75_0%,#fa7e1e_25%,#d62976_50%,#962fbf_75%,#4f5bd5_100%)] text-white shadow-sm" aria-hidden="true">
      <InstagramIcon className="h-4 w-4" />
    </span>}
    onView={posts.length ? onHomepageView : undefined}
    label="Instagram post"
    itemCount={posts.length}
    description={<div className="space-y-1">
      <p className="break-words text-xs text-cocoa/70 sm:text-sm">@{feed?.username ?? 'luviacreations'}</p>
      {status}
    </div>}
    className="mt-10 rounded-3xl border border-mustard/40 bg-white p-4 sm:mt-14 sm:p-7"
    headerAction={followLink}
    headerLayout="stacked-mobile"
    viewAll="/from-instagram/"
  >
    {cards}
  </RotatingCarousel>;
}
