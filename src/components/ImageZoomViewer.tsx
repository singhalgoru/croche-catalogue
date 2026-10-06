import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { preventImageContextMenu } from '../utils/imageProtection';

interface Props {
  image: string;
  alt: string;
  onClose: () => void;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
  hasMultipleImages?: boolean;
  preloadImages?: string[];
}

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

const distance = (left: Point, right: Point) =>
  Math.hypot(right.x - left.x, right.y - left.y);

const midpoint = (left: Point, right: Point): Point => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2,
});

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export default function ImageZoomViewer({
  image,
  alt,
  onClose,
  onPreviousImage,
  onNextImage,
  hasMultipleImages = false,
  preloadImages = [],
}: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const suppressDismissClick = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const previousPinch = useRef<{ distance: number; center: Point } | null>(null);
  const dragStart = useRef<{ point: Point; offset: Point } | null>(null);
  const swipeStart = useRef<{ point: Point; time: number } | null>(null);
  const swipeAxis = useRef<'x' | 'y' | null>(null);
  const lastTapAt = useRef(0);
  const gestureMoved = useRef(false);
  const gestureWasMultiTouch = useRef(false);

  const preloadKey = preloadImages.join('\n');
  useEffect(() => {
    // Warm the cache so neighbouring photos appear instantly when swiping.
    if (!preloadKey) return;
    for (const src of preloadKey.split('\n')) {
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = src;
    }
  }, [preloadKey]);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const setZoom = (nextScale: number) => {
    const resolvedScale = clampScale(nextScale);
    setScale(resolvedScale);
    if (resolvedScale === 1) setOffset({ x: 0, y: 0 });
  };

  const surfaceWidth = () =>
    surfaceRef.current?.getBoundingClientRect().width || window.innerWidth || 1;

  const showAdjacent = (direction: 1 | -1, fromX = 0) => {
    if (!hasMultipleImages) return;
    if (direction > 0) onNextImage?.();
    else onPreviousImage?.();
    reset();
    // Place the new photo just off-screen on the incoming side, then let it glide in.
    setIsDragging(true);
    setSlideX(fromX + direction * surfaceWidth());
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setIsDragging(false);
        setSlideX(0);
      }),
    );
  };

  const finishSlide = (dx: number, elapsedMs: number) => {
    const velocity = Math.abs(dx) / Math.max(elapsedMs, 1);
    const isFlick = Math.abs(dx) >= 30 && velocity > 0.4;
    const isLongDrag = Math.abs(dx) >= Math.min(120, surfaceWidth() * 0.2);
    if (hasMultipleImages && (isFlick || isLongDrag)) {
      showAdjacent(dx < 0 ? 1 : -1, dx);
      return;
    }
    setIsDragging(false);
    setSlideX(0);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; some browsers reject synthetic pointers.
    }
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 1) {
      suppressDismissClick.current = false;
      gestureMoved.current = false;
      gestureWasMultiTouch.current = false;
      dragStart.current = { point, offset };
      swipeStart.current = scale === 1 ? { point, time: Date.now() } : null;
      swipeAxis.current = null;
    } else if (pointers.current.size === 2) {
      suppressDismissClick.current = true;
      gestureWasMultiTouch.current = true;
      const [first, second] = [...pointers.current.values()];
      previousPinch.current = {
        distance: distance(first, second),
        center: midpoint(first, second),
      };
      dragStart.current = null;
      if (swipeStart.current) {
        swipeStart.current = null;
        setSlideX(0);
      }
      setIsDragging(true);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    if (dragStart.current &&
      Math.hypot(event.clientX - dragStart.current.point.x, event.clientY - dragStart.current.point.y) > 8) {
      suppressDismissClick.current = true;
    }
    const previousPoint = pointers.current.get(event.pointerId);
    if (
      previousPoint &&
      Math.hypot(event.clientX - previousPoint.x, event.clientY - previousPoint.y) > 8
    ) {
      gestureMoved.current = true;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const nextDistance = distance(first, second);
      const nextCenter = midpoint(first, second);
      const previous = previousPinch.current;
      if (previous && previous.distance > 0) {
        setScale((current) => clampScale(current * (nextDistance / previous.distance)));
        setOffset((current) => ({
          x: current.x + nextCenter.x - previous.center.x,
          y: current.y + nextCenter.y - previous.center.y,
        }));
      }
      previousPinch.current = { distance: nextDistance, center: nextCenter };
      return;
    }

    const swipe = swipeStart.current;
    if (swipe) {
      const dx = event.clientX - swipe.point.x;
      const dy = event.clientY - swipe.point.y;
      if (!swipeAxis.current && Math.hypot(dx, dy) > 8) {
        swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (swipeAxis.current === 'x') {
        setIsDragging(true);
        setSlideX(hasMultipleImages ? dx : dx * 0.25);
      }
      return;
    }

    if (scale > 1 && dragStart.current) {
      setIsDragging(true);
      setOffset({
        x: dragStart.current.offset.x + event.clientX - dragStart.current.point.x,
        y: dragStart.current.offset.y + event.clientY - dragStart.current.point.y,
      });
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointercancel') suppressDismissClick.current = true;
    const swipe = swipeStart.current;
    const wasHorizontalSwipe = swipeAxis.current === 'x';
    pointers.current.delete(event.pointerId);
    previousPinch.current = null;
    dragStart.current = null;

    if (swipe && pointers.current.size === 0) {
      swipeStart.current = null;
      swipeAxis.current = null;
      if (wasHorizontalSwipe) {
        finishSlide(event.clientX - swipe.point.x, Date.now() - swipe.time);
        gestureMoved.current = false;
        gestureWasMultiTouch.current = false;
        return;
      }
    }

    if (
      event.pointerType === 'touch' &&
      pointers.current.size === 0 &&
      !gestureMoved.current &&
      !gestureWasMultiTouch.current
    ) {
      const now = Date.now();
      if (now - lastTapAt.current < 300) {
        setZoom(scale > 1 ? 1 : 2);
        lastTapAt.current = 0;
      } else {
        lastTapAt.current = now;
      }
    }
    if (pointers.current.size === 0) {
      gestureMoved.current = false;
      gestureWasMultiTouch.current = false;
      setIsDragging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`Zoomed image of ${alt}`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target instanceof Element && event.target.closest('button')) return;
        if (suppressDismissClick.current) return;
        const photo = imageRef.current;
        if (!photo || !photo.naturalWidth || !photo.naturalHeight) return;
        // object-contain leaves clickable letterboxing inside the full-screen img element.
        const bounds = photo.getBoundingClientRect();
        const ratio = Math.min(bounds.width / photo.naturalWidth, bounds.height / photo.naturalHeight);
        const width = photo.naturalWidth * ratio;
        const height = photo.naturalHeight * ratio;
        const left = bounds.left + (bounds.width - width) / 2;
        const top = bounds.top + (bounds.height - height) / 2;
        if (event.clientX < left || event.clientX > left + width ||
          event.clientY < top || event.clientY > top + height) onClose();
      }}
    >
      <div
        ref={surfaceRef}
        className={`absolute inset-0 touch-none overflow-hidden ${
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={() => setZoom(scale > 1 ? 1 : 2)}
      >
        <img
          ref={imageRef}
          src={image}
          alt={alt}
          draggable={false}
          onContextMenu={preventImageContextMenu}
          className="h-full w-full select-none object-contain will-change-transform"
          style={{
            transform: `translate3d(${offset.x + slideX}px, ${offset.y}px, 0) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-black/40 text-2xl text-white backdrop-blur-md hover:bg-black/60"
        aria-label="Close image zoom"
      >
        ×
      </button>

      {hasMultipleImages && (
        <>
          <button
            type="button"
            onClick={() => showAdjacent(-1)}
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-black/40 text-3xl text-white backdrop-blur-md hover:bg-black/60"
            aria-label="Show previous zoomed product image"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => showAdjacent(1)}
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-black/40 text-3xl text-white backdrop-blur-md hover:bg-black/60"
            aria-label="Show next zoomed product image"
          >
            ›
          </button>
        </>
      )}

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-black/45 p-1.5 text-white backdrop-blur-md">
        <button
          type="button"
          onClick={() => setZoom(scale - 0.5)}
          disabled={scale <= MIN_SCALE}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15 disabled:opacity-35"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-w-16 rounded-full px-2 py-2 text-sm font-semibold hover:bg-white/15"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom(scale + 0.5)}
          disabled={scale >= MAX_SCALE}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15 disabled:opacity-35"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
