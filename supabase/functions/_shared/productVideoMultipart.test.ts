// @vitest-environment node
import { expect, it } from 'vitest';
import { completeMultipartXml, multipartUploadId, multipartUrl } from './productVideoMultipart.js';

it('round-trips opaque R2 upload IDs, including XML entities and URL-significant characters', () => {
  const id = multipartUploadId('<InitiateMultipartUploadResult><UploadId>2~opaque/id+&amp;=</UploadId></InitiateMultipartUploadResult>');
  expect(id).toBe('2~opaque/id+&=');
  const url = new URL(multipartUrl('https://account.r2.cloudflarestorage.com/private/original.mp4', id, 63));
  expect(url.searchParams.get('uploadId')).toBe(id);
  expect(url.searchParams.get('partNumber')).toBe('63');
});
it('rejects invalid initiation responses and unsafe/missing completion ETags', () => {
  for (const xml of ['', '<Error/>', '<UploadId>&unknown;</UploadId>', '<UploadId>x\n</UploadId>']) {
    expect(() => multipartUploadId(xml)).toThrow('invalid multipart upload ID');
  }
  for (const parts of [[], ['<bad>'], ['"invalid"'], Array(64).fill('"0123456789abcdef0123456789abcdef"')]) {
    expect(() => completeMultipartXml(parts)).toThrow();
  }
});
