import { useEffect, useState } from 'react';
import { fetchInstagramFeed } from '../services/instagramFeed';
import type { InstagramFeed as InstagramFeedData } from '../../supabase/functions/_shared/instagramFeed';
import { InstagramIcon } from './SocialIcons';
import RotatingCarousel from './RotatingCarousel';

export default function InstagramFeed() {
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
    : 'https://www.instagram.com/luvia.craftedwithlove/';

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
    description={status}
    className="rounded-3xl border border-mustard/40 bg-white p-5 sm:p-7"
    headerAction={<a href={profileUrl} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cocoa/20 px-4 py-2 text-sm font-semibold hover:bg-mustard/10">
      <InstagramIcon className="h-4 w-4" /> Follow Luvia
    </a>}
  >
    {feed?.posts.map(post => {
        const label = post.mediaType === 'VIDEO' ? 'Video' : post.mediaType === 'CAROUSEL_ALBUM' ? 'Photo carousel' : 'Photo';
        const caption = post.caption.trim().replace(/\s+/g, ' ');
        const summary = caption.slice(0, 180);
        const alt = summary
          ? `Instagram ${label.toLowerCase()} from @${feed.username}: ${summary}${caption.length > summary.length ? '…' : ''}`
          : `Instagram ${label.toLowerCase()} from @${feed.username}`;
        return <div key={post.id} className="w-[47%] min-w-0 shrink-0 snap-start sm:w-[calc((100%-24px)/3)] lg:w-[calc((100%-36px)/4)]">
          <a href={post.permalink} target="_blank" rel="noopener noreferrer"
            aria-label={`View ${label.toLowerCase()} from @${feed.username} on Instagram${summary ? `: ${summary}` : ''}`}
            className="group relative block aspect-square overflow-hidden rounded-xl bg-cream-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
            <img src={post.previewUrl} alt={alt} loading="lazy" decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <span className="absolute bottom-2 left-2 rounded-full bg-cocoa/85 px-2.5 py-1 text-xs font-semibold text-cream">{label}</span>
          </a>
          {post.caption && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-cocoa/75">{post.caption}</p>}
        </div>;
      })}
  </RotatingCarousel>;
}
