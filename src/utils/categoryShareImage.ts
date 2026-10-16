import type { CategoryHotspot } from '../types/product';
import { getHotspotRingOverlay } from './categoryImage.js';
import { getShareableImageFile } from './shareImage';

const loadImage = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to load the category share photo.')); };
  image.src = url;
});

export async function getCategoryShareImageFile(imageUrl: string, name: string, hotspots: CategoryHotspot[]): Promise<File | null> {
  const file = await getShareableImageFile(imageUrl, name);
  if (!file || !hotspots.length) return file;
  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The category photo has invalid dimensions.');
  const scale = Math.min(1, 1080 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const overlay = getHotspotRingOverlay(width, height, hotspots);
  const rings = await loadImage(new Blob([overlay.svg], { type: 'image/svg+xml' }));
  const canvas = document.createElement('canvas');
  canvas.width = overlay.width;
  canvas.height = overlay.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the hotspot share photo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, overlay.padding, overlay.padding, width, height);
  context.drawImage(rings, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to encode the hotspot share photo.')), 'image/webp', 0.9));
  if (blob.type !== 'image/webp') throw new Error('WebP photo sharing is not supported by this browser.');
  return new File([blob], `${name}.webp`, { type: 'image/webp' });
}
