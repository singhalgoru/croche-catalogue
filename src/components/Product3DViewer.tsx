import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';

interface Props {
  image: string;
  alt: string;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.15;
const ROTATION_STEP = 15;
const MAX_TILT = 65;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (left: Point, right: Point) =>
  Math.hypot(right.x - left.x, right.y - left.y);

export default function Product3DViewer({ image, alt, onClose }: Props) {
  const [rotation, setRotation] = useState({ x: -8, y: -18 });
  const [zoom, setZoom] = useState(1);
  const [isInteracting, setIsInteracting] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const lastDragPoint = useRef<Point | null>(null);
  const previousPinchDistance = useRef<number | null>(null);

  const setClampedZoom = (nextZoom: number) => {
    setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM));
  };

  const rotateBy = (x: number, y: number) => {
    setRotation((current) => ({
      x: clamp(current.x + x, -MAX_TILT, MAX_TILT),
      y: current.y + y,
    }));
  };

  const reset = () => {
    setRotation({ x: -8, y: -18 });
    setZoom(1);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);

    setIsInteracting(true);

    if (pointers.current.size === 1) {
      lastDragPoint.current = point;
      previousPinchDistance.current = null;
      return;
    }

    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      previousPinchDistance.current = distance(first, second);
      lastDragPoint.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const nextDistance = distance(first, second);
      const previousDistance = previousPinchDistance.current;
      if (previousDistance && previousDistance > 0) {
        setZoom((current) => clamp(current * (nextDistance / previousDistance), MIN_ZOOM, MAX_ZOOM));
      }
      previousPinchDistance.current = nextDistance;
      return;
    }

    const previousPoint = lastDragPoint.current;
    if (!previousPoint) return;

    const deltaX = event.clientX - previousPoint.x;
    const deltaY = event.clientY - previousPoint.y;
    rotateBy(deltaY * -0.35, deltaX * 0.35);
    lastDragPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    previousPinchDistance.current = null;

    if (pointers.current.size === 1) {
      lastDragPoint.current = [...pointers.current.values()][0] ?? null;
      return;
    }

    lastDragPoint.current = null;
    setIsInteracting(false);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setClampedZoom(zoom + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP));
  };

  const imageTransform = `perspective(1200px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${zoom})`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(246,196,83,0.18),_rgba(0,0,0,0.94)_62%)] px-4 py-16"
      role="dialog"
      aria-modal="true"
      aria-label={`3D view of ${alt}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-black/40 text-2xl text-white backdrop-blur-md hover:bg-black/60"
        aria-label="Close 3D view"
      >
        ×
      </button>

      <div className="absolute left-4 top-4 right-20 z-10 rounded-2xl border border-white/20 bg-black/35 px-4 py-3 text-sm text-white backdrop-blur-md sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
        Drag to rotate, pinch or use controls to zoom.
      </div>

      <div
        className="relative flex h-full w-full touch-none select-none items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <div
          className="relative aspect-square w-[min(76vw,62vh)] cursor-grab rounded-3xl active:cursor-grabbing"
          style={{
            transform: imageTransform,
            transformStyle: 'preserve-3d',
            transition: isInteracting ? 'none' : 'transform 160ms ease-out',
          }}
        >
          <img
            src={image}
            alt={alt}
            draggable={false}
            className="absolute inset-0 h-full w-full rounded-3xl border border-white/45 bg-cream object-cover shadow-2xl"
            style={{ backfaceVisibility: 'hidden', transform: 'translateZ(16px)' }}
          />
          <img
            src={image}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 h-full w-full rounded-3xl border border-white/20 bg-cocoa object-cover opacity-55 shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              filter: 'brightness(0.7) saturate(0.8)',
              transform: 'rotateY(180deg) translateZ(16px)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-full w-8 rounded-l-3xl bg-gradient-to-r from-cocoa/85 to-cocoa/30"
            style={{ transform: 'rotateY(90deg) translateZ(-16px)', transformOrigin: 'left center' }}
          />
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-full w-8 rounded-r-3xl bg-gradient-to-l from-cocoa/85 to-cocoa/30"
            style={{ transform: 'rotateY(-90deg) translateZ(-16px)', transformOrigin: 'right center' }}
          />
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-8 w-full rounded-t-3xl bg-gradient-to-b from-cocoa/70 to-cocoa/20"
            style={{ transform: 'rotateX(-90deg) translateZ(-16px)', transformOrigin: 'center top' }}
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-0 h-8 w-full rounded-b-3xl bg-gradient-to-t from-cocoa/80 to-cocoa/20"
            style={{ transform: 'rotateX(90deg) translateZ(-16px)', transformOrigin: 'center bottom' }}
          />
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 grid -translate-x-1/2 grid-cols-[auto_auto_auto] items-center gap-2 rounded-3xl border border-white/30 bg-black/45 p-2 text-white backdrop-blur-md">
        <button
          type="button"
          onClick={() => rotateBy(0, -ROTATION_STEP)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15"
          aria-label="Rotate left"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => rotateBy(-ROTATION_STEP, 0)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15"
          aria-label="Tilt up"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => rotateBy(0, ROTATION_STEP)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15"
          aria-label="Rotate right"
        >
          ↷
        </button>
        <button
          type="button"
          onClick={() => setClampedZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15 disabled:opacity-35"
          aria-label="Zoom out 3D view"
        >
          −
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-w-16 rounded-full px-2 py-2 text-sm font-semibold hover:bg-white/15"
          aria-label="Reset 3D view"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setClampedZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15 disabled:opacity-35"
          aria-label="Zoom in 3D view"
        >
          +
        </button>
        <span aria-hidden="true" />
        <button
          type="button"
          onClick={() => rotateBy(ROTATION_STEP, 0)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-white/15"
          aria-label="Tilt down"
        >
          ↓
        </button>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
