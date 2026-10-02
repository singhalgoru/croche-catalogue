const FALLBACK_EXTENSION = 'jpg';
export const SHARE_IMAGE_ACCEPT = 'image/webp,image/jpeg;q=0.9,image/*;q=0.8';

const extensionFromContentType = (contentType: string): string => {
  const subtype = contentType.split('/')[1]?.split(';')[0]?.split('+')[0];
  return subtype || FALLBACK_EXTENSION;
};

// Slugifies a product name into a safe file name so shared images don't carry
// spaces or punctuation that could confuse target apps.
export const toShareFileName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';

// Fetches a product image and packages it as a File so it can be attached to
// a native share (e.g. Web Share API) alongside the product link, letting
// Instagram and similar apps show the photo instead of a plain text link.
// Returns null if the image can't be fetched (network/CORS failure) or isn't
// actually an image, so callers can fall back to a link-only share.
export const getShareableImageFile = async (
  imageUrl: string,
  fileNameBase: string,
): Promise<File | null> => {
  try {
    // fetch() sends "Accept: */*" by default, which makes Supabase's image
    // transformer answer with PNG — often 5-6x larger than the WebP it
    // serves to <img>. Accept is CORS-safelisted, so this adds no preflight.
    const response = await fetch(imageUrl, {
      mode: 'cors',
      // Skip a possible CORS-less HTTP cache copy from an earlier <img> load.
      cache: 'reload',
      headers: { Accept: SHARE_IMAGE_ACCEPT },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], `${fileNameBase}.${extensionFromContentType(blob.type)}`, {
      type: blob.type,
    });
  } catch {
    return null;
  }
};
