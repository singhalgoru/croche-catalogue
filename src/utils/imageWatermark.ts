// Subtle brand badge stamped into the bottom-right corner of every uploaded
// product photo. scripts/watermark-r2-images.mjs uses the same values for
// photos uploaded before the watermark existed; keep the two in sync.
export const WATERMARK_SIZE_RATIO = 0.12;
export const WATERMARK_MARGIN_RATIO = 0.03;
export const WATERMARK_RING_RATIO = 0.035;
export const WATERMARK_OPACITY = 0.7;
const MIN_WATERMARK_SIZE = 16;

export const WATERMARK_LOGO_SRC = `${import.meta.env.BASE_URL}images/luvia-logo-480.webp`;

// Cards and the product popup show a centred square crop (object-cover), so
// the badge sits in that square's bottom-right corner to stay visible there.
export const getWatermarkBox = (width: number, height: number) => {
  const shortSide = Math.min(width, height);
  const size = Math.round(shortSide * WATERMARK_SIZE_RATIO);
  const margin = Math.round(shortSide * WATERMARK_MARGIN_RATIO);
  const ring = Math.max(2, Math.round(size * WATERMARK_RING_RATIO));
  return {
    x: Math.round((width + shortSide) / 2) - size - margin,
    y: Math.round((height + shortSide) / 2) - size - margin,
    size,
    ring,
  };
};

let logoPromise: Promise<HTMLImageElement> | null = null;

export const loadWatermarkLogo = () => {
  logoPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The Luvia watermark logo could not be loaded.'));
    image.src = WATERMARK_LOGO_SRC;
  }).catch((error: unknown) => {
    logoPromise = null;
    throw error;
  });
  return logoPromise;
};

export function drawWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  logo: CanvasImageSource,
) {
  const { x, y, size, ring } = getWatermarkBox(width, height);
  if (size < MIN_WATERMARK_SIZE) return;

  // Build the badge opaque first, then blend it once so the logo shows the
  // photo through it rather than its own white ring.
  const badge = document.createElement('canvas');
  badge.width = size;
  badge.height = size;
  const badgeContext = badge.getContext('2d');
  if (!badgeContext) throw new Error('Unable to add the Luvia watermark.');
  const center = size / 2;
  badgeContext.fillStyle = '#ffffff';
  badgeContext.beginPath();
  badgeContext.arc(center, center, center, 0, Math.PI * 2);
  badgeContext.fill();
  badgeContext.save();
  badgeContext.beginPath();
  badgeContext.arc(center, center, center - ring, 0, Math.PI * 2);
  badgeContext.clip();
  badgeContext.drawImage(logo, ring, ring, size - ring * 2, size - ring * 2);
  badgeContext.restore();

  context.save();
  context.globalAlpha = WATERMARK_OPACITY;
  context.drawImage(badge, x, y);
  context.restore();
}
