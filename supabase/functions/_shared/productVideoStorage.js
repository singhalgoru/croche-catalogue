import { abortVideoMultipart } from './productVideoMultipart.js';

const UUID = /^[0-9a-f-]{36}$/i;

// Only call for an explicitly authorized, persistent 'discarding' tombstone.
export async function deleteVideoDraftAssets(r2, privateEndpoint, publicEndpoints, id, uploadId) {
  if (!UUID.test(id)) throw new Error('Invalid video draft ID.');
  await abortVideoMultipart(r2, `${privateEndpoint}/making-videos/${id}/original.mp4`, uploadId);
  // Videos published before the dedicated video bucket existed stay in the image bucket, so clean every candidate.
  const publics = [...new Set([publicEndpoints].flat())];
  for (const [endpoint, file] of [
    [privateEndpoint, 'original.mp4'], [privateEndpoint, 'music.bin'],
    [privateEndpoint, 'video.mp4'], [privateEndpoint, 'poster.webp'],
    ...publics.flatMap(endpoint => [[endpoint, 'video.mp4'], [endpoint, 'poster.webp']]),
  ]) {
    const response = await r2.fetch(`${endpoint}/making-videos/${id}/${file}`, {
      method: 'DELETE', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && !(response.status === 404 && /<Code>NoSuchKey<\/Code>/.test(await response.text()))) {
      throw new Error(`Draft cleanup failed (HTTP ${response.status}). Retry discard; the published video is unchanged.`);
    }
  }
}
