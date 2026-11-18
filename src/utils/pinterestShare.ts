import { prepareSocialPostJpeg } from './imageUploadConversion';
import { loadWatermarkLogo } from './imageWatermark';
import { getProductImageUrl } from './productImageUrl';
import { toShareFileName } from './shareImage';
import type { Product } from '../types/product';

export async function preparePinterestPin(product: Pick<Product, 'name' | 'image'>, title: string): Promise<File> {
  if (!title.trim() || title.length > 100) throw new Error('Enter a Pinterest title of 1 to 100 characters.');
  const [photo, logo] = await Promise.all([
    prepareSocialPostJpeg(getProductImageUrl(product.image, 960)), loadWatermarkLogo(),
  ]);
  const bitmap = await createImageBitmap(photo);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1500;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare a Pinterest image.');
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(logo, 410, 35, 180, 180);
    context.fillStyle = '#f6c453';
    context.fillRect(60, 235, 880, 5);
    context.textAlign = 'center';
    context.fillStyle = '#5d4037';
    let lines: string[] = [];
    for (let size = 56; size >= 24; size -= 2) {
      context.font = `bold ${size}px Arial, sans-serif`;
      lines = [''];
      for (const char of title.trim()) {
        const index = lines.length - 1;
        if (context.measureText(lines[index]! + char).width > 880) {
          const breakAt = lines[index]!.lastIndexOf(' ');
          if (breakAt > 0) {
            const remainder = lines[index]!.slice(breakAt + 1) + char;
            lines[index] = lines[index]!.slice(0, breakAt);
            lines.push(remainder.trimStart());
          } else lines.push(char.trimStart());
        } else lines[index] += char;
      }
      if (lines.length <= 3) break;
    }
    if (lines.length > 3) throw new Error('Shorten the Pinterest title so it fits the image.');
    lines.forEach((line, index) => context.fillText(line.trim(), 500, 300 + index * 64));
    context.font = '32px Arial, sans-serif';
    context.fillText('Premium handmade crochet', 500, 485);
    const scale = Math.min(880 / bitmap.width, 640 / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    context.drawImage(bitmap, (1000 - width) / 2, 535 + (640 - height) / 2, width, height);
    context.fillText('Explore this piece at Luvia', 500, 1285);
    context.font = 'bold 48px Arial, sans-serif';
    context.fillText('luviacreations.com', 500, 1380);
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    if (!jpeg || jpeg.type !== 'image/jpeg' || !jpeg.size || jpeg.size > 8 * 1024 * 1024) {
      throw new Error('This browser could not prepare a Pinterest JPEG below 8 MB.');
    }
    return new File([jpeg], `${toShareFileName(product.name)}-pinterest.jpg`, { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}
