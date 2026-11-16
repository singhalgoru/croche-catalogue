import { drawWatermark, loadWatermarkLogo } from './imageWatermark';

const WEBP_UPLOAD_QUALITY = 0.82;
const MAX_IMAGE_DIMENSION = 1600;

const extensionPattern = /\.[^.]+$/;

const getWebpFileName = (name: string) => {
  const baseName = name.replace(extensionPattern, '') || 'product-image';
  return `${baseName}.webp`;
};

const canvasToBlob = async (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      resolve,
      'image/webp',
      quality,
    );
  });
  if (blob?.type === 'image/webp') return blob;

  // WebKit can decode WebP but returns PNG when asked to encode it.
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the product image for upload.');
  const { encodeWebp } = await import('./webpEncoder');
  return encodeWebp(context.getImageData(0, 0, canvas.width, canvas.height), quality);
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be prepared for upload.'));
    };
    image.src = objectUrl;
  });

export async function convertImageForUpload(
  file: File,
  { watermark = true }: { watermark?: boolean } = {},
): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Upload a JPG, PNG or WebP product image.');
  }

  const [image, logo] = await Promise.all([
    loadImageElement(file),
    watermark ? loadWatermarkLogo() : Promise.resolve(null),
  ]);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The selected product image has invalid dimensions.');

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the product image for upload.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // The resized R2 copies are made from this file, so they inherit the mark.
  if (logo) drawWatermark(context, canvas.width, canvas.height, logo);
  const blob = await canvasToBlob(canvas, WEBP_UPLOAD_QUALITY);

  return new File([blob], getWebpFileName(file.name), {
    type: 'image/webp',
    lastModified: file.lastModified,
  });
}

const RESIZED_WEBP_QUALITY = 0.75;

// Pre-generated display widths for storage without on-the-fly resizing (R2).
export async function createResizedWebp(file: File, targetWidth: number): Promise<File> {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The selected product image has invalid dimensions.');

  const scale = Math.min(1, targetWidth / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the product image for upload.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, RESIZED_WEBP_QUALITY);
  return new File([blob], `w${targetWidth}.webp`, { type: 'image/webp' });
}

export async function prepareSocialPostJpeg(sourceUrl: string): Promise<File> {
  const response = await fetch(sourceUrl, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Unable to download the published product photo (HTTP ${response.status}).`);
  const file = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    throw new Error('The published product photo must be a JPEG, PNG or WebP up to 8 MB.');
  }
  const image = await loadImageElement(new File([file], 'product-photo', { type: file.type }));
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (Math.min(width, height) < 320) throw new Error('Use a published product photo at least 320 pixels on each side.');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the social post image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1080, 1080);
  const scale = 1080 / Math.max(width, height);
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  context.drawImage(image, Math.floor((1080 - drawWidth) / 2), Math.floor((1080 - drawHeight) / 2), drawWidth, drawHeight);
  const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!jpeg || jpeg.type !== 'image/jpeg' || !jpeg.size || jpeg.size > 8 * 1024 * 1024) {
    throw new Error('This browser could not prepare a JPEG preview within the 8 MB limit.');
  }
  return new File([jpeg], 'social-post.jpg', { type: 'image/jpeg' });
}
