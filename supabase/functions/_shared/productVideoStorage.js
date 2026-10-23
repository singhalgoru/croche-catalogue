import { abortVideoMultipart } from './productVideoMultipart.js';

const UUID = /^[0-9a-f-]{36}$/i;

export function videoPublicFiles(name) {
  if (name != null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Invalid public video asset name.');
  }
  return [['video.mp4', name ? `${name}.mp4` : 'video.mp4'],
    ['poster.webp', name ? `${name}-poster.webp` : 'poster.webp']];
}

// Only call for an explicitly authorized, persistent 'discarding' tombstone.
// 'replaced' jobs are also permanent tombstones and cannot be republished.
export async function deleteVideoDraftAssets(r2, privateEndpoint, publicEndpoints, id, uploadId, publicName = null, verify = false) {
  if (!UUID.test(id)) throw new Error('Invalid video draft ID.');
  await abortVideoMultipart(r2, `${privateEndpoint}/making-videos/${id}/original.mp4`, uploadId);
  // Videos published before the dedicated video bucket existed stay in the image bucket, so clean every candidate.
  const publics = [...new Set([publicEndpoints].flat())];
  for (const [endpoint, file] of [
    [privateEndpoint, 'original.mp4'], [privateEndpoint, 'music.bin'],
    [privateEndpoint, 'video.mp4'], [privateEndpoint, 'poster.webp'],
    ...publics.flatMap(endpoint => [...new Set(['video.mp4', 'poster.webp',
      ...videoPublicFiles(publicName).map(([, file]) => file)])].map(file => [endpoint, file])),
  ]) {
    const response = await r2.fetch(`${endpoint}/making-videos/${id}/${file}`, {
      method: 'DELETE', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && !(response.status === 404 && /<Code>NoSuchKey<\/Code>/.test(await response.text()))) {
      throw new Error(`Draft cleanup failed (HTTP ${response.status}). Retry discard; the published video is unchanged.`);
    }
    if (verify) {
      const head = await r2.fetch(`${endpoint}/making-videos/${id}/${file}`, {
        method: 'HEAD', signal: AbortSignal.timeout(30_000),
      });
      if (head.status !== 404) throw new Error(`Replaced video deletion could not be verified (HTTP ${head.status}). Retry the processing workflow.`);
    }
  }
}
