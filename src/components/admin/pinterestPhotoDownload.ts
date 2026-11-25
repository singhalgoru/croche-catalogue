import { buildProductImagePrompt } from '../../utils/productImagePrompt';

export interface PinterestDownloadVariant {
  id: string;
  name: string;
  image: string;
  label: string;
}

export const pinterestFilename = (variant: PinterestDownloadVariant) => {
  const safeLabel = [...variant.label.replace(/[<>:"/\\|?*]/g, '-')]
    .map(character => character.charCodeAt(0) < 32 ? '-' : character).join('')
    .replace(/[. ]+$/, '').slice(0, 100);
  return `${safeLabel} - ${variant.id}`;
};

export async function makePinterestDownload(
  variants: PinterestDownloadVariant[],
  onProgress: (message: string) => void,
): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [index, variant] of variants.entries()) {
    onProgress(`Downloading ${index + 1} of ${variants.length}: ${variant.label}`);
    let response: Response;
    try {
      response = await fetch(variant.image);
    } catch (failure) {
      throw new Error(`Unable to download ${variant.label}: ${failure instanceof Error ? failure.message : 'Network error.'}`);
    }
    if (!response.ok) throw new Error(`Unable to download ${variant.label}: photo request failed (${response.status}).`);
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const extension = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg'
      : type === 'image/png' ? 'png' : type === 'image/avif' ? 'avif' : type === 'image/gif' ? 'gif' : '';
    if (!extension) throw new Error(`Unable to download ${variant.label}: unsupported photo type ${type || '(missing)'}.`);
    const filename = pinterestFilename(variant);
    zip.file(`${filename}.${extension}`, await response.arrayBuffer());
    zip.file(`${filename}.txt`, buildProductImagePrompt('', 'pinterest', variant.name));
  }
  onProgress('Preparing ZIP file...');
  return zip.generateAsync({ type: 'uint8array' });
}
