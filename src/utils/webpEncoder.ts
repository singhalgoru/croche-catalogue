import encode, { init } from '@jsquash/webp/encode.js';
import encoderUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import simdEncoderUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

let ready: ReturnType<typeof init> | undefined;

export async function encodeWebp(image: ImageData, quality: number): Promise<Blob> {
  ready ??= init({
    locateFile: (filename: string) => filename.endsWith('_simd.wasm') ? simdEncoderUrl : encoderUrl,
  });
  try {
    await ready;
    const bytes = await encode(image, { quality: quality * 100 });
    return new Blob([bytes], { type: 'image/webp' });
  } catch (cause) {
    ready = undefined;
    throw new Error('Unable to prepare the image on this device. Check your connection, reload and try again.', { cause });
  }
}
