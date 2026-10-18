import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { deleteVideoDraftAssets } from '../_shared/productVideoStorage.js';
import { abortVideoMultipart, completeMultipartXml, MAX_VIDEO_SOURCE_BYTES,
  multipartUploadId, multipartUrl, VIDEO_PART_BYTES } from '../_shared/productVideoMultipart.js';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorMessage = (error: unknown) => error && typeof error === 'object' && 'message' in error
  ? String(error.message) : 'Video request failed.';

async function readUpload(request: Request, expected: number) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) !== expected) throw new Error('Video size does not match the reserved upload.');
  if (!request.body) throw new Error('Video upload is empty.');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(expected);
  let offset = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.length > expected) throw new Error('Video exceeds the reserved size limit.');
      bytes.set(chunk.value, offset); offset += chunk.value.length;
    }
  } finally { await reader.cancel(); }
  if (offset !== expected) throw new Error('Video upload was incomplete.');
  return bytes;
}

export const BRAND_MUSIC_KEY = 'making-video-music/luvia-gentle.wav';
const MAX_MUSIC_BYTES = 20 * 1024 * 1024;

function sameSecret(supplied: string, expected: string) {
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) difference |= (a[index] ?? 0) ^ b[index];
  return difference === 0 && b.length > 0;
}

// Structural PCM WAV check before storage; the worker re-validates with FFprobe.
function validateWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Default music must be a PCM WAV file.');
  let format = false;
  let data = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === 'fmt ' && size >= 16 && offset + 24 <= bytes.length) {
      const code = view.getUint16(offset + 8, true);
      const channels = view.getUint16(offset + 10, true);
      const rate = view.getUint32(offset + 12, true);
      const bits = view.getUint16(offset + 22, true);
      format = [1, 3, 0xfffe].includes(code) && channels >= 1 && channels <= 2 &&
        rate >= 8000 && rate <= 96000 && [8, 16, 24, 32].includes(bits);
    }
    if (tag(offset) === 'data' && size > 0) data = true;
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) throw new Error('Default music must be mono/stereo 8–96 kHz PCM WAV audio.');
}

// Service-role-only: installs the private default (brand) track. Admin JWTs,
// anon keys and browsers cannot reach this path; nothing is made public.
async function installBrandMusic(request: Request) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  // The gateway (verify_jwt) has already verified the signature; its role claim distinguishes service keys.
  let claimRole = '';
  try {
    claimRole = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? '';
  } catch { /* non-JWT keys are compared directly */ }
  if (!serviceKey || !(sameSecret(token, serviceKey) || claimRole === 'service_role')) {
    return json({ error: 'Service role required.' }, 403);
  }
  const type = request.headers.get('content-type')?.split(';')[0];
  const declared = request.headers.get('content-length');
  if (!['audio/wav', 'audio/x-wav'].includes(type ?? '') || !declared || !/^\d+$/.test(declared) ||
    Number(declared) < 44 || Number(declared) > MAX_MUSIC_BYTES) {
    await request.body?.cancel();
    return json({ error: 'Send a PCM WAV (audio/wav) up to 20 MB with Content-Length.' }, 400);
  }
  const account = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const bucket = Deno.env.get('R2_ORIGINALS_BUCKET');
  const publicBucket = Deno.env.get('R2_BUCKET');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!account || !bucket || !publicBucket || bucket === publicBucket || !accessKeyId || !secretAccessKey) {
    await request.body?.cancel();
    return json({ error: 'Private video storage is not configured.' }, 503);
  }
  const bytes = await readUpload(request, Number(declared));
  validateWav(bytes);
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 1 });
  const response = await r2.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${BRAND_MUSIC_KEY}`, {
    method: 'PUT', body: bytes, signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' },
  });
  if (!response.ok) throw new Error(`Default music upload failed (HTTP ${response.status}).`);
  return json({ installed: true, bytes: bytes.length });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    if (new URL(request.url).searchParams.get('action') === 'install-brand-music') return await installBrandMusic(request);
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Authentication required.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: user, error: authError } = await db.auth.getUser();
    if (authError || !user.user) return json({ error: 'Authentication required.' }, 401);
    const { data: admin, error: adminError } = await db.rpc('is_catalogue_admin');
    if (adminError) throw new Error('Unable to verify admin access.');
    if (!admin) return json({ error: 'Admin access required.' }, 403);
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(name, args);
      if (error) throw error;
      return data;
    };
    const contentType = request.headers.get('content-type')?.split(';')[0];
    const binary = contentType === 'video/mp4' || contentType === 'application/octet-stream';
    const query = new URL(request.url).searchParams;
    const body = binary ? { action: query.get('action') || 'upload',
      jobId: query.get('jobId'), part: Number(query.get('part')) } : await request.json();
    if (body.action === 'reprocess') {
      const musicChoice = body.music ?? 'keep';
      if (!uuid.test(body.jobId) || !['keep', 'brand', 'none'].includes(musicChoice)) {
        return json({ error: 'Invalid video reprocess request.' }, 400);
      }
      // Re-queues the retained private original; the trigger dispatches the worker.
      if (await rpc('reprocess_product_video', { p_job_id: body.jobId, p_music: musicChoice }) !== true) {
        throw new Error('Reprocessing was not confirmed. Reload the status before retrying.');
      }
      return json({ queued: true });
    }
    if (body.action === 'remove') {
      if (!uuid.test(body.productId)) return json({ error: 'Invalid product ID.' }, 400);
      await rpc('remove_product_video', { p_product_id: body.productId });
      return json({ removed: true });
    }
    const account = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const bucket = Deno.env.get('R2_ORIGINALS_BUCKET');
    const publicBucket = Deno.env.get('R2_VIDEO_BUCKET') || Deno.env.get('R2_BUCKET');
    const legacyBucket = Deno.env.get('R2_BUCKET');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicUrl = (Deno.env.get('R2_VIDEO_PUBLIC_URL') || Deno.env.get('R2_PUBLIC_URL'))?.replace(/\/+$/, '');
    if (!account || !bucket || !publicBucket || bucket === publicBucket || !accessKeyId || !secretAccessKey || !serviceKey || !publicUrl) {
      return json({ error: 'Private video storage is not configured.' }, 503);
    }
    const service = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });
    const serviceRpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await service.rpc(name, args);
      if (error) throw error;
      return data;
    };
    const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 1 });
    const endpoint = `https://${account}.r2.cloudflarestorage.com`;
    const privateEndpoint = `${endpoint}/${bucket}`;
    const publicEndpoint = `${endpoint}/${publicBucket}`;
    const publicEndpoints = [...new Set([publicBucket, legacyBucket])].map(name => `${endpoint}/${name}`);
    const cleanup = async (id: string) => {
      try {
        const { data: job, error } = await service.from('product_video_jobs')
          .select('status,writer_active,original_upload_id').eq('id', id).single();
        if (error) throw error;
        if (job?.status !== 'discarding' || job.writer_active) return false;
        await deleteVideoDraftAssets(r2, privateEndpoint, publicEndpoints, id, job.original_upload_id);
        return await serviceRpc('finish_product_video_discard', { p_job_id: id });
      } catch (error) {
        await serviceRpc('finish_product_video_discard', { p_job_id: id, p_error: errorMessage(error) });
        throw error;
      }
    };
    const cleanupIfDiscarded = async (id: string) => {
      const { data, error } = await service.from('product_video_jobs').select('status').eq('id', id).single();
      if (error) throw error;
      if (data?.status === 'discarding') await cleanup(id);
    };
    if (body.action === 'prepare') {
      if (!uuid.test(body.productId) || body.type !== 'video/mp4' || !Number.isSafeInteger(body.size) ||
        body.size < 1 || body.size > MAX_VIDEO_SOURCE_BYTES) {
        return json({ error: 'Choose an MP4 video no larger than 500 MB. Clips must still be 1–60 seconds.' }, 400);
      }
      const music = body.music;
      const brand = music?.source === 'brand';
      // Older open tabs may still send mode 'mix'; any supplied track now replaces source audio.
      if (music !== undefined && !brand && (!music || !Number.isSafeInteger(music.size) || music.size < 1 ||
        music.size > MAX_MUSIC_BYTES || !['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav'].includes(music.type) ||
        ![undefined, 'mix', 'replace'].includes(music.mode) || music.rightsConfirmed !== true)) {
        return json({ error: 'Choose MP3, M4A or WAV music up to 20 MB and confirm permission to use it.' }, 400);
      }
      const jobId = await rpc(brand ? 'reserve_product_video_with_brand_music'
        : music ? 'reserve_product_video_with_music' : 'reserve_product_video',
        { p_product_id: body.productId, p_bytes: body.size, ...(music && !brand ? {
          p_music_bytes: music.size, p_music_type: music.type, p_music_mode: 'replace',
          p_music_rights: music.rightsConfirmed,
        } : {}) });
      return json({ jobId });
    }
    if (body.action === 'start') {
      if (binary || !uuid.test(body.jobId)) return json({ error: 'Invalid video upload.' }, 400);
      const [job] = await rpc('begin_product_video_upload', { p_job_id: body.jobId });
      let uploadId: string | undefined;
      const finish = (error?: string) => serviceRpc('finish_product_video_transfer', {
        p_job_id: job.id, p_lease: job.lease, p_operation: 'start',
        p_upload_id: uploadId ?? null, p_error: error ?? null,
      });
      try {
        const response = await r2.fetch(`${privateEndpoint}/making-videos/${job.id}/original.mp4?uploads`, {
          method: 'POST', headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Private multipart initiation failed (HTTP ${response.status}).`);
        uploadId = multipartUploadId(await response.text());
        if (!await finish()) throw new Error('Upload was discarded. No video was queued.');
        return json({ started: true });
      } catch (error) {
        // Initiation may have raced discard, or registration may have committed
        // despite a lost response. Abort the exact locally known ID before release.
        let failure = error;
        try {
          if (uploadId) await abortVideoMultipart(r2, `${privateEndpoint}/making-videos/${job.id}/original.mp4`, uploadId);
        } catch (abortError) { failure = new Error(`${errorMessage(error)} ${errorMessage(abortError)}`); }
        await finish(errorMessage(failure));
        await cleanupIfDiscarded(job.id);
        throw failure;
      }
    }
    if (['part', 'music', 'complete'].includes(body.action)) {
      const operation = body.action as 'part' | 'music' | 'complete';
      if (!uuid.test(body.jobId) || (operation === 'complete' ? binary : !binary) ||
        (operation === 'part' && (!Number.isInteger(body.part) || body.part < 1 || body.part > 63))) {
        return json({ error: 'Invalid video upload operation.' }, 400);
      }
      const [job] = await rpc('claim_product_video_transfer', {
        p_job_id: body.jobId, p_operation: operation, p_part: operation === 'part' ? body.part : null,
      });
      const finish = (error?: string, etag?: string) => operation === 'complete'
        ? serviceRpc('finish_product_video_upload', { p_job_id: job.id, p_lease: job.lease, p_error: error ?? null })
        : serviceRpc('finish_product_video_transfer', { p_job_id: job.id, p_lease: job.lease,
          p_operation: operation, p_etag: etag ?? null, p_error: error ?? null });
      try {
        const original = `${privateEndpoint}/making-videos/${job.id}/original.mp4`;
        if (operation === 'complete') {
          const response = await r2.fetch(multipartUrl(original, job.original_upload_id), {
            method: 'POST', body: completeMultipartXml(job.original_parts),
            headers: { 'Content-Type': 'application/xml' }, signal: AbortSignal.timeout(60_000),
          });
          const result = await response.text();
          if (!response.ok || /<Error(?:\s|>)/.test(result) || !result.includes('<CompleteMultipartUploadResult')) {
            throw new Error(`Private video completion failed (HTTP ${response.status}). Discard the draft and retry.`);
          }
        } else {
          const expected = operation === 'music' ? Number(job.music_bytes)
            : Math.min(VIDEO_PART_BYTES, Number(job.source_bytes) - (body.part - 1) * VIDEO_PART_BYTES);
          if (!Number.isSafeInteger(expected) || expected < 1 ||
            expected > (operation === 'music' ? 20 * 1024 * 1024 : VIDEO_PART_BYTES)) {
            throw new Error('Invalid reserved upload size.');
          }
          const bytes = await readUpload(request, expected);
          const response = await r2.fetch(operation === 'music'
            ? `${privateEndpoint}/making-videos/${job.id}/music.bin`
            : multipartUrl(original, job.original_upload_id, body.part), {
            method: 'PUT', body: bytes, headers: {
              'Content-Type': operation === 'music' ? job.music_type : 'application/octet-stream',
              'Cache-Control': 'private, no-store',
            }, signal: AbortSignal.timeout(60_000),
          });
          if (!response.ok) throw new Error(`Private ${operation} upload failed (HTTP ${response.status}).`);
          const etag = response.headers.get('etag');
          if (operation === 'part' && (!etag || !/^"[a-f0-9]{32}"$/i.test(etag))) {
            throw new Error('Private video part upload returned an invalid ETag.');
          }
          if (!await finish(undefined, etag ?? undefined)) throw new Error('Upload was discarded. No video was queued.');
          await cleanupIfDiscarded(job.id);
          return json({ uploaded: true });
        }
        const queued = await finish();
        await cleanupIfDiscarded(job.id);
        if (!queued) throw new Error('Upload was discarded. No video was queued.');
        return json({ queued: true, jobId: job.id });
      } catch (error) {
        await finish(errorMessage(error));
        await cleanupIfDiscarded(job.id);
        throw error;
      }
    }
    if (body.action === 'upload') {
      if (!binary || !uuid.test(body.jobId)) return json({ error: 'Invalid video upload.' }, 400);
      const [job] = await rpc('begin_product_video_upload', { p_job_id: body.jobId });
      const finish = (error?: string) => serviceRpc('finish_product_video_upload', {
        p_job_id: job.id, p_lease: job.lease, p_error: error ?? null,
      });
      try {
        // Compatibility for older open admin tabs only. New uploads always use
        // bounded multipart requests; never allocate a large original here.
        if (Number(job.source_bytes) > 60 * 1024 * 1024) {
          throw new Error('Reload the admin to upload videos up to 500 MB in bounded parts.');
        }
        const hasMusic = job.music_bytes != null;
        if (contentType !== (hasMusic ? 'application/octet-stream' : 'video/mp4')) {
          throw new Error('Upload content type does not match the reserved media.');
        }
        // One bounded writer owns both objects, so discard fences late music PUTs too.
        const bytes = await readUpload(request, Number(job.source_bytes) + Number(job.music_bytes ?? 0));
        const response = await r2.fetch(`${privateEndpoint}/making-videos/${job.id}/original.mp4`, {
          method: 'PUT', body: bytes.subarray(0, Number(job.source_bytes)),
          headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Private video upload failed (HTTP ${response.status}).`);
        if (hasMusic) {
          const musicResponse = await r2.fetch(`${privateEndpoint}/making-videos/${job.id}/music.bin`, {
            method: 'PUT', body: bytes.subarray(Number(job.source_bytes)),
            headers: { 'Content-Type': job.music_type, 'Cache-Control': 'private, no-store' },
            signal: AbortSignal.timeout(60_000),
          });
          if (!musicResponse.ok) throw new Error(`Private music upload failed (HTTP ${musicResponse.status}).`);
        }
        const queued = await finish();
        await cleanupIfDiscarded(job.id);
        if (!queued) throw new Error('Upload was discarded. No video was queued.');
        return json({ queued: true, jobId: job.id });
      } catch (error) {
        await finish(errorMessage(error));
        await cleanupIfDiscarded(job.id);
        throw error;
      }
    }
    if (body.action === 'discard') {
      if (!uuid.test(body.productId)) return json({ error: 'Invalid product ID.' }, 400);
      const [job] = await rpc('discard_product_video', { p_product_id: body.productId });
      if (!job) return json({ discarded: true });
      const discarded = await cleanup(job.id);
      return json({ discarded, pending: !discarded });
    }
    if (body.action === 'preview') {
      if (!uuid.test(body.jobId)) return json({ error: 'Invalid video draft ID.' }, 400);
      const { data: job, error } = await db.from('product_video_jobs')
        .select('id,status,duration_seconds,width,height,video_bytes').eq('id', body.jobId).single();
      if (error || !job || job.status !== 'review') return json({ error: 'Video is not ready for review.' }, 409);
      const signed = async (file: string) => {
        const url = new URL(`${privateEndpoint}/making-videos/${job.id}/${file}`);
        url.searchParams.set('X-Amz-Expires', '300');
        return (await r2.sign(url, { method: 'GET', aws: { signQuery: true } })).url;
      };
      return json({ videoUrl: await signed('video.mp4'), posterUrl: await signed('poster.webp'),
        durationSeconds: Number(job.duration_seconds), width: job.width, height: job.height,
        videoBytes: job.video_bytes, expiresAt: new Date(Date.now() + 300_000).toISOString() });
    }
    if (body.action === 'publish') {
      if (!uuid.test(body.jobId)) return json({ error: 'Invalid video draft ID.' }, 400);
      const [job] = await rpc('begin_product_video_publish', { p_job_id: body.jobId });
      const base = `${publicUrl}/making-videos/${job.id}`;
      const finish = (error?: string) => serviceRpc('finish_product_video_publish', {
        p_job_id: job.id, p_lease: job.lease, p_video_url: `${base}/video.mp4`,
        p_poster_url: `${base}/poster.webp`, p_error: error ?? null,
      });
      let published = false;
      let publicationRequested = false;
      try {
        // Server-side R2 copies: no FFmpeg or large video download in the edge request.
        for (const [file, type] of [['video.mp4', 'video/mp4'], ['poster.webp', 'image/webp']]) {
          const response = await r2.fetch(`${publicEndpoint}/making-videos/${job.id}/${file}`, {
            method: 'PUT', signal: AbortSignal.timeout(30_000),
            headers: { 'x-amz-copy-source': `/${bucket}/making-videos/${job.id}/${file}`,
              'x-amz-metadata-directive': 'REPLACE', 'Content-Type': type,
              'Cache-Control': 'public, max-age=31536000, immutable' },
          });
          const result = await response.text();
          if (!response.ok || /<Error(?:\s|>)/.test(result) || !result.includes('<CopyObjectResult')) {
            throw new Error(`Video publication copy failed (HTTP ${response.status}). Preview and retry.`);
          }
        }
        publicationRequested = true;
        published = await finish();
        if (!published) {
          await cleanupIfDiscarded(job.id);
          throw new Error('Publication was cancelled. The previous public video is unchanged.');
        }
        return json({ published: true });
      } catch (error) {
        if (!published) {
          let failure = errorMessage(error);
          // Roll back only this failed publication's public copies, never retained
          // originals/private previews or the previously published job's assets.
          for (const file of publicationRequested ? [] : ['video.mp4', 'poster.webp']) {
            try {
              const response = await r2.fetch(`${publicEndpoint}/making-videos/${job.id}/${file}`, {
                method: 'DELETE', signal: AbortSignal.timeout(30_000),
              });
              if (!response.ok && response.status !== 404) throw new Error('Public copy deletion failed.');
            } catch {
              failure += ' Public copy cleanup failed; discard the draft to retry cleanup.';
            }
          }
          await finish(failure);
          if (publicationRequested) {
            // A lost HTTP response does not prove the transaction rolled back.
            // Never delete potentially-live copies after an uncertain commit.
            const { data: confirmed, error: confirmError } = await service.from('product_video_jobs')
              .select('status').eq('id', job.id).single();
            if (confirmError) throw new Error(`${failure} Publication status could not be confirmed; reload before retrying.`);
            if (confirmed?.status === 'ready') return json({ published: true });
          }
          await cleanupIfDiscarded(job.id);
          throw new Error(failure);
        }
        throw error;
      }
    }
    return json({ error: 'Unsupported video action.' }, 400);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
});
