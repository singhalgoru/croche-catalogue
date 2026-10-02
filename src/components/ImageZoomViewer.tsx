import { useRef, useState, type PointerEvent, type TouchEvent } from 'react';
import { preventImageContextMenu } from '../utils/imageProtection';

interface Props {
  image: string;
  alt: string;
  onClose: () => void;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
  hasMultipleImages?: boolean;
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
}: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const previousPinch = useRef<{ distance: number; center: Point } | null>(null);
  const dragStart = useRef<{ point: Point; offset: Point } | null>(null);
  const lastTapAt = useRef(0);
  const gestureMoved = useRef(false);
  const gestureWasMultiTouch = useRef(false);
  const touchSwipeStart = useRef<Point | null>(null);
  const lastImageSwipeAt = useRef(0);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const setZoom = (nextScale: number) => {
    const resolvedScale = clampScale(nextScale);
    setScale(resolvedScale);
    if (resolvedScale === 1) setOffset({ x: 0, y: 0 });
  };

  const navigateSwipe = (start: Point, end: Point) => {
    if (scale !== 1 || !hasMultipleImages) return false;
    const now = Date.now();
    if (now - lastImageSwipeAt.current < 250) return false;

    const horizontalDistance = end.x - start.x;
    const verticalDistance = end.y - start.y;
    const isHorizontalSwipe =
      Math.abs(horizontalDistance) >= 50 &&
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.25;

    if (!isHorizontalSwipe) return false;

    if (horizontalDistance < 0) onNextImage?.();
    else onPreviousImage?.();
    lastImageSwipeAt.current = now;
    reset();
    return true;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 1) {
      gestureMoved.current = false;
      gestureWasMultiTouch.current = false;
      dragStart.current = { point, offset };
    } else if (pointers.current.size === 2) {
      gestureWasMultiTouch.current = true;
      const [first, second] = [...pointers.current.values()];
      previousPinch.current = {
        distance: distance(first, second),
        center: midpoint(first, second),
      };
      dragStart.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
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

    if (scale > 1 && dragStart.current) {
      setOffset({
        x: dragStart.current.offset.x + event.clientX - dragStart.current.point.x,
        y: dragStart.current.offset.y + event.clientY - dragStart.current.point.y,
      });
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current?.point;
    const isSinglePointerGesture = pointers.current.size === 1 && !gestureWasMultiTouch.current;
    pointers.current.delete(event.pointerId);
    previousPinch.current = null;
    dragStart.current = null;

    if (isSinglePointerGesture && start) {
      const end = { x: event.clientX, y: event.clientY };
      navigateSwipe(start, end);
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
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchSwipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchSwipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchSwipeStart.current;
    touchSwipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    navigateSwipe(start, { x: touch.clientX, y: touch.clientY });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`Zoomed image of ${alt}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={`absolute inset-0 touch-none overflow-hidden ${
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={() => setZoom(scale > 1 ? 1 : 2)}
      >
        <img
          src={image}
          alt={alt}
          draggable={false}
          onContextMenu={preventImageContextMenu}
          className="h-full w-full select-none object-contain transition-transform duration-100"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
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
            onClick={() => {
              onPreviousImage?.();
              reset();
            }}
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-black/40 text-3xl text-white backdrop-blur-md hover:bg-black/60"
            aria-label="Show previous zoomed product image"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              onNextImage?.();
              reset();
            }}
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
