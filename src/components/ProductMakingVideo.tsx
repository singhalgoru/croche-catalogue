import { useRef, useState } from 'react';
import type { Product } from '../types/product';
import { trackEvent } from '../services/analytics';

export const MAKING_VIDEO_ID = 'making-video';

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
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState(false);
  const [needsPlayTap, setNeedsPlayTap] = useState(false);
  const started = useRef(false);
  const video = product.makingVideo;
  if (!video) return null;
  const event = (name: string) => trackEvent(name, { product_id: product.id });
  const portrait = video.width / video.height < 0.9;
  const frameClass = portrait
    ? 'aspect-[4/5] w-full rounded-lg bg-cocoa/10 object-cover object-bottom'
    : 'w-full rounded-lg bg-cocoa/10 object-cover';
  const frameStyle = portrait ? undefined : { aspectRatio: `${video.width} / ${video.height}` };
  return (
    <section id={MAKING_VIDEO_ID} aria-label="Making video" className="my-5 scroll-mt-4 rounded-xl border border-cocoa/15 p-3">
      <h3 className="mb-2 font-heading text-lg font-semibold text-cocoa">See how it’s made</h3>
      {requested ? (
        <video
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
          preload="none"
          width={video.width}
          height={video.height}
          aria-label={`Making ${product.name}`}
          className={frameClass}
          style={frameStyle}
          onPlay={() => { setNeedsPlayTap(false); event('making_video_play'); }}
          onEnded={() => event('making_video_complete')}
          onError={() => { setError(true); event('making_video_error'); }}
        />
      ) : (
        <button type="button" data-making-play className="relative block w-full overflow-hidden rounded-lg bg-cream"
          onClick={() => { setRequested(true); event('making_video_request'); }}
          aria-label={`Play making video for ${product.name}`}>
          <img src={video.posterUrl} alt="" loading="lazy" width={video.width} height={video.height}
            className={frameClass} style={frameStyle} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-cocoa px-5 py-3 font-semibold text-white">▶ Watch making video</span>
          </span>
        </button>
      )}
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
