import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { socialHttpsUrl, socialUuid } from '../_shared/socialPosts.ts';

export function validatePostJpeg(bytes: Uint8Array) {
  if (bytes.length < 20 || bytes.length > 8 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('Prepare a valid JPEG image up to 8 MB.');
  }
  let dimensionsVerified = false;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe2 && bytes[offset + 4] === 0x4d && bytes[offset + 5] === 0x50 && bytes[offset + 6] === 0x46) {
      throw new Error('Extended JPEG formats are not supported.');
    }
    if (marker === 0xda && dimensionsVerified) return;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8 || bytes[offset + 4] !== 8) break;
      const height = bytes[offset + 5] * 256 + bytes[offset + 6];
      const width = bytes[offset + 7] * 256 + bytes[offset + 8];
      if (width !== 1080 || height !== 1080) throw new Error('Prepare a 1080 by 1080 JPEG preview before publishing.');
      dimensionsVerified = true;
    }
    offset += length + 2;
  }
  throw new Error('The prepared image is not a supported JPEG.');
}

export async function storePostImage(env: (name: string) => string | undefined, productId: string, bytes: Uint8Array) {
  if (!socialUuid(productId)) throw new Error('Invalid product identity for image preparation.');
  validatePostJpeg(bytes);
  const accountId = env('R2_ACCOUNT_ID') || env('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET');
  const publicUrl = env('R2_PUBLIC_URL')?.replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !socialHttpsUrl(publicUrl)) {
    throw new Error('Public R2 storage is required to prepare social post images.');
  }
  const key = `social-posts/${productId}/${crypto.randomUUID()}.jpg`;
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const result = await client.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`, {
    method: 'PUT', body: new Uint8Array(bytes).buffer, signal: AbortSignal.timeout(20000), headers: {
      'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'If-None-Match': '*',
    },
  });
  if (!result.ok) throw new Error(`Prepared social image upload failed (HTTP ${result.status}).`);
  return `${publicUrl}/${key}`;
}
