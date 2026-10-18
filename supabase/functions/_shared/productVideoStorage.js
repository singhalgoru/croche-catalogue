const UUID = /^[0-9a-f-]{36}$/i;

// Only call for an explicitly authorized, persistent 'discarding' tombstone.
export async function deleteVideoDraftAssets(r2, privateEndpoint, publicEndpoint, id) {
  if (!UUID.test(id)) throw new Error('Invalid video draft ID.');
  for (const [endpoint, file] of [
    [privateEndpoint, 'original.mp4'], [privateEndpoint, 'video.mp4'], [privateEndpoint, 'poster.webp'],
    [publicEndpoint, 'video.mp4'], [publicEndpoint, 'poster.webp'],
  ]) {
    const response = await r2.fetch(`${endpoint}/making-videos/${id}/${file}`, {
      method: 'DELETE', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Draft cleanup failed (HTTP ${response.status}). Retry discard; the published video is unchanged.`);
    }
  }
}
