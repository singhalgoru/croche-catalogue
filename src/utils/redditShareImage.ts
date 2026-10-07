import { getShareableImageFile, toShareFileName } from './shareImage';

export async function getRedditShareImage(image: string, title: string): Promise<File> {
  const photo = await getShareableImageFile(image, toShareFileName(title));
  if (!photo) throw new Error('Unable to load the product photo. Retry or use a Reddit link post.');
  if (photo.type === 'image/jpeg' || photo.type === 'image/png') return photo;
  const bitmap = await createImageBitmap(photo);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to convert the photo. Use a Reddit link post instead.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('Unable to prepare a JPEG photo. Retry or use a Reddit link post.'));
      }, 'image/jpeg', 0.92);
    });
    return new File([blob], `${toShareFileName(title)}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
