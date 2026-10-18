import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Same badge asset, ratios, white ring and opacity as imageWatermark.ts / watermark-r2-images.mjs.
export const VIDEO_WATERMARK = { size: 0.12, margin: 0.03, ring: 0.035, opacity: 0.7 };
const LOGO = fileURLToPath(new URL('../public/images/luvia-logo-480.webp', import.meta.url));
export async function createVideoWatermark(width, height) {
  const shortSide = Math.min(width, height);
  const size = Math.max(16, Math.round(shortSide * VIDEO_WATERMARK.size));
  const margin = Math.max(1, Math.round(shortSide * VIDEO_WATERMARK.margin));
  const ring = Math.max(2, Math.round(size * VIDEO_WATERMARK.ring));
  const inner = size - ring * 2;
  const circle = (diameter) => Buffer.from(`<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: 'fill' })
    .composite([{ input: circle(inner), blend: 'dest-in' }]).png().toBuffer();
  const opaque = await sharp({ create: { width: size, height: size, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: circle(size) }, { input: logo, left: ring, top: ring }]).png().toBuffer();
  return { bytes: await sharp(opaque).ensureAlpha().linear([1, 1, 1, VIDEO_WATERMARK.opacity], [0, 0, 0, 0]).png().toBuffer(),
    size, margin };
}
