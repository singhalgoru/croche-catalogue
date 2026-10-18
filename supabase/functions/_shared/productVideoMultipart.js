export const VIDEO_PART_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_SOURCE_BYTES = 500 * 1024 * 1024;

export function multipartUrl(objectUrl, uploadId, partNumber) {
  const url = new URL(objectUrl);
  url.searchParams.set('uploadId', uploadId);
  if (partNumber !== undefined) url.searchParams.set('partNumber', String(partNumber));
  return url.toString();
}

export function multipartUploadId(xml) {
  const raw = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!raw || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(raw)) {
    throw new Error('Private storage returned an invalid multipart upload ID.');
  }
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const value = raw.replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity) => entities[entity]);
  if (value.length > 2048 || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('Private storage returned an invalid multipart upload ID.');
  }
  return value;
}

export function completeMultipartXml(parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 63) throw new Error('Invalid video upload parts.');
  return `<CompleteMultipartUpload>${parts.map((etag, index) => {
    if (typeof etag !== 'string' || !/^"[a-f0-9]{32}"$/i.test(etag)) throw new Error('Invalid video upload ETag.');
    return `<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`;
  }).join('')}</CompleteMultipartUpload>`;
}

export async function abortVideoMultipart(r2, objectUrl, uploadId) {
  if (!uploadId) return;
  const response = await r2.fetch(multipartUrl(objectUrl, uploadId), {
    method: 'DELETE', signal: AbortSignal.timeout(30_000),
  });
  // Only NoSuchUpload proves the MPU is gone; arbitrary 404 errors may mean an
  // incorrect bucket/configuration and must not be reported as successful cleanup.
  if (!response.ok && !(response.status === 404 && /<Code>NoSuchUpload<\/Code>/.test(await response.text()))) {
    throw new Error(`Multipart abort failed (HTTP ${response.status}). Retry discard cleanup.`);
  }
}
