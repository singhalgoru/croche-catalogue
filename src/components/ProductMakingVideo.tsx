import { useEffect, useRef, useState } from 'react';
import type { Product } from '../types/product';
import { trackEvent } from '../services/analytics';
import { toProductPageUrl } from '../utils/productLink';
import { ShareIcon } from './SocialIcons';
import { productImageProtection } from '../utils/imageProtection';

export const MAKING_VIDEO_ID = 'making-video';
const isVideoLink = () => window.location.hash === `#${MAKING_VIDEO_ID}`
  || new URLSearchParams(window.location.search).get('watch') === MAKING_VIDEO_ID;

export function WatchMakingVideoLink({ product }: { product: Product }) {
  if (!product.makingVideo) return null;
  return (
    <a
      href={`#${MAKING_VIDEO_ID}`}
      className="mt-2 inline-flex items-center gap-2 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold text-cocoa underline"
      onClick={(event) => {
        event.preventDefault();
        const section = document.getElementById(MAKING_VIDEO_ID);
        section?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        section?.querySelector<HTMLButtonElement>('button[data-making-play]')?.click();
      }}
    >
      ▶ Watch how it’s made
    </a>
  );
}

export default function ProductMakingVideo({ product }: { product: Product }) {
  const [requested, setRequested] = useState(isVideoLink);
  const [muted, setMuted] = useState(isVideoLink);
  const [error, setError] = useState(false);
  const [needsPlayTap, setNeedsPlayTap] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareError, setShareError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const started = useRef(false);
  const watchedMilestones = useRef(new Set<number>());
  const video = product.makingVideo;
  useEffect(() => {
    if (!video) return;
    let frame = 0;
    const scrollToVideo = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'start' }));
    };
    const openVideo = () => {
      if (!isVideoLink()) return;
      setMuted(true);
      setRequested(true);
      scrollToVideo();
    };
    // Product photos above the player can change layout after the app mounts.
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (isVideoLink()) scrollToVideo(); }) : null;
    if (isVideoLink()) {
      scrollToVideo();
      if (sectionRef.current?.parentElement) observer?.observe(sectionRef.current.parentElement);
    }
    const stopFollowing = () => observer?.disconnect();
    const timer = window.setTimeout(stopFollowing, 5000);
    window.addEventListener('pointerdown', stopFollowing, { once: true });
    window.addEventListener('wheel', stopFollowing, { once: true });
    window.addEventListener('hashchange', openVideo);
    return () => {
      observer?.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', stopFollowing);
      window.removeEventListener('wheel', stopFollowing);
      window.removeEventListener('hashchange', openVideo);
    };
  }, [video]);
  if (!video) return null;
  const event = (name: string) => trackEvent(name, { product_id: product.id });
  const shareUrl = `${toProductPageUrl(product)}?watch=${MAKING_VIDEO_ID}#${MAKING_VIDEO_ID}`;
  const share = async () => {
    setSharing(true); setShareMessage(''); setShareError(false);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${video.title || product.name} | Luvia Creations`,
          text: `Watch how ${product.name} is made by Luvia Creations.`,
          url: shareUrl,
        });
        event('making_video_share');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage('Making video link copied.');
        event('making_video_share');
      } else {
        setShareError(true);
        setShareMessage('Sharing is unavailable in this browser. Copy the video link below.');
      }
    } catch (error) {
      if (!(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) {
        setShareError(true);
        setShareMessage('Unable to share the making video. Copy the video link below.');
      }
    } finally {
      setSharing(false);
    }
  };
  const frameClass = 'block h-auto w-full rounded-lg bg-cocoa/10 object-contain';
  const frameStyle = { ...productImageProtection.style, aspectRatio: `${video.width} / ${video.height}` };
  return (
    <section ref={sectionRef} id={MAKING_VIDEO_ID} aria-label="Making video" className="my-5 scroll-mt-24 rounded-xl border border-cocoa/15 p-3">
      <h3 className="mb-2 font-heading text-lg font-semibold text-cocoa">{video.title || 'See how it’s made'}</h3>
      {requested ? (
        <video
          {...productImageProtection}
          key={video.videoUrl}
          ref={(element) => {
            if (element && !started.current) {
              started.current = true;
              void element.play().catch(() => {
                setNeedsPlayTap(true);
              });
            }
          }}
          src={video.videoUrl}
          poster={video.posterUrl}
          controls
          controlsList="nodownload"
          playsInline
          muted={muted}
          onVolumeChange={event => setMuted(event.currentTarget.muted)}
          preload="none"
          width={video.width}
          height={video.height}
          aria-label={video.title || `Making ${product.name}`}
          className={frameClass}
          style={frameStyle}
          onPlay={() => { setNeedsPlayTap(false); event('making_video_play'); }}
          onTimeUpdate={({ currentTarget }) => {
            if (currentTarget.currentTime <= 0 || currentTarget.paused || currentTarget.seeking) return;
            if (!watchedMilestones.current.has(0)) {
              watchedMilestones.current.add(0);
              event('making_video_view');
            }
            const duration = currentTarget.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;
            const progress = currentTarget.currentTime / duration * 100;
            for (const milestone of [25, 50, 75]) {
              if (progress >= milestone && !watchedMilestones.current.has(milestone)) {
                watchedMilestones.current.add(milestone);
                trackEvent('making_video_progress', { product_id: product.id, percent: milestone });
              }
            }
          }}
          onEnded={() => event('making_video_complete')}
          onError={() => { setError(true); event('making_video_error'); }}
        />
      ) : (
        <button type="button" data-making-play className="relative block w-full overflow-hidden rounded-lg bg-cream"
          onClick={() => { setRequested(true); event('making_video_request'); }}
          aria-label={`Play making video for ${product.name}`}>
          <img {...productImageProtection} src={video.posterUrl} alt={`Preview of ${product.name} being made`} loading="lazy" width={video.width} height={video.height}
            className={frameClass} style={frameStyle} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-cocoa px-5 py-3 font-semibold text-white">▶ Watch making video</span>
          </span>
        </button>
      )}
      <button type="button" aria-label="Share making video" title="Share making video" disabled={sharing} onClick={() => void share()}
        className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-cocoa/30 text-cocoa disabled:opacity-50">
        <ShareIcon className="h-5 w-5" />
      </button>
      {requested && muted && <button type="button" className="mt-2 text-sm text-cocoa underline"
        onClick={() => setMuted(false)}>Turn sound on</button>}
      {shareMessage && <p role={shareError ? 'alert' : 'status'} className="mt-2 text-sm text-cocoa">{shareMessage}</p>}
      {shareError && <input aria-label="Making video share link" readOnly value={shareUrl}
        onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded border border-cocoa/30 p-2 text-sm" />}
      {needsPlayTap && !error && <p role="status" className="mt-2 text-sm text-cocoa">
        Tap the video’s play control to start playback.
      </p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">
        This making video could not be played. Please try again.
        <button type="button" className="ml-2 underline" onClick={() => {
          started.current = false; setRequested(false); setError(false); setNeedsPlayTap(false);
        }}>Retry video</button>
      </p>}
    </section>
  );
}
