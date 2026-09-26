const WEBP_UPLOAD_QUALITY = 0.82;
const MAX_IMAGE_DIMENSION = 1600;

const extensionPattern = /\.[^.]+$/;

const getWebpFileName = (name: string) => {
  const baseName = name.replace(extensionPattern, '') || 'product-image';
  return `${baseName}.webp`;
};

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Unable to encode the product image as WebP.')),
      'image/webp',
      WEBP_UPLOAD_QUALITY,
    );
  });

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

export async function convertImageForUpload(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Upload a JPG, PNG or WebP product image.');
  }

  const image = await loadImageElement(file);
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
  const blob = await canvasToBlob(canvas);
  if (blob.type !== 'image/webp') throw new Error('WebP image encoding is not supported by this browser.');
  if (file.type === 'image/webp' && scale === 1 && blob.size >= file.size) return file;

  return new File([blob], getWebpFileName(file.name), {
    type: 'image/webp',
    lastModified: file.lastModified,
  });
}
