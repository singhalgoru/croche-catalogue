const WEBP_UPLOAD_QUALITY = 0.95;

const extensionPattern = /\.[^.]+$/;

const getWebpFileName = (name: string) => {
  const baseName = name.replace(extensionPattern, '') || 'product-image';
  return `${baseName}.webp`;
};

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', WEBP_UPLOAD_QUALITY);
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
  if (file.type === 'image/webp') return file;
  if (!['image/jpeg', 'image/png'].includes(file.type)) return file;

  try {
    const image = await loadImageElement(file);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return file;

    context.drawImage(image, 0, 0);
    const blob = await canvasToBlob(canvas);
    if (!blob || blob.size === 0) return file;

    return new File([blob], getWebpFileName(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
