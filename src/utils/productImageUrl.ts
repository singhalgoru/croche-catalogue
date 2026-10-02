const PUBLIC_IMAGE_PATH = '/storage/v1/object/public/product-images/';
const RENDER_IMAGE_PATH = '/storage/v1/render/image/public/product-images/';
const LEGACY_CATALOGUE_IMAGE_PATH = '/croche-catalogue/images/';

export const normalizeProductImageUrl = (source: string): string => {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }

  if (
    url.hostname === 'singhalgoru.github.io' &&
    url.pathname.startsWith(LEGACY_CATALOGUE_IMAGE_PATH)
  ) {
    return `${url.pathname.replace('/croche-catalogue', '')}${url.search}${url.hash}`;
  }

  return source;
};

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

// R2 has no on-the-fly resizing, so uploads store fixed widths next to the
// full image: products/<user>/<id>.webp plus <id>-w160.webp, -w480, -w960.
export const R2_IMAGE_WIDTHS = [160, 480, 960] as const;
const R2_IMAGE_PATH = /^\/products\/[^/]+\/[^/]+\.webp$/;

export const isR2ImageHost = (hostname: string) =>
  hostname === 'images.luviacreations.com' || hostname.endsWith('.r2.dev');

const r2SizedImageUrl = (source: string, width: number): string | null => {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isR2ImageHost(url.hostname) || !R2_IMAGE_PATH.test(url.pathname)) {
    return null;
  }

  const size = R2_IMAGE_WIDTHS.find((candidate) => candidate >= width);
  if (size) url.pathname = url.pathname.replace(/\.webp$/, `-w${size}.webp`);
  return url.toString();
};

export const getProductImageUrl = (source: string, width: number): string =>
  transformedImageUrl(source, width) ?? r2SizedImageUrl(source, width) ?? normalizeProductImageUrl(source);

export const getProductCardSrcSet = (source: string): string | undefined => {
  const small = transformedImageUrl(source, 480) ?? r2SizedImageUrl(source, 480);
  const large = transformedImageUrl(source, 960) ?? r2SizedImageUrl(source, 960);
  return small && large ? `${small} 480w, ${large} 960w` : undefined;
};
