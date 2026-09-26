const PUBLIC_IMAGE_PATH = '/storage/v1/object/public/product-images/';
const RENDER_IMAGE_PATH = '/storage/v1/render/image/public/product-images/';

const transformedImageUrl = (source: string, width: number): string | null => {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') ||
      !url.pathname.startsWith(PUBLIC_IMAGE_PATH)) return null;

  url.pathname = url.pathname.replace(PUBLIC_IMAGE_PATH, RENDER_IMAGE_PATH);
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', '75');
  url.searchParams.set('resize', 'contain');
  return url.toString();
};

export const getProductImageUrl = (source: string, width: number): string =>
  transformedImageUrl(source, width) ?? source;

export const getProductCardSrcSet = (source: string): string | undefined => {
  const small = transformedImageUrl(source, 480);
  const large = transformedImageUrl(source, 960);
  return small && large ? `${small} 480w, ${large} 960w` : undefined;
};
