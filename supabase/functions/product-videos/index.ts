import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { deleteVideoDraftAssets } from '../_shared/productVideoStorage.js';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
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
    const binary = request.headers.get('content-type')?.split(';')[0] === 'video/mp4';
    const body = binary ? { action: 'upload', jobId: new URL(request.url).searchParams.get('jobId') } : await request.json();
    if (body.action === 'remove') {
      if (!uuid.test(body.productId)) return json({ error: 'Invalid product ID.' }, 400);
      await rpc('remove_product_video', { p_product_id: body.productId });
      return json({ removed: true });
    }
    const account = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const bucket = Deno.env.get('R2_ORIGINALS_BUCKET');
    const publicBucket = Deno.env.get('R2_BUCKET');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicUrl = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/+$/, '');
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
    const cleanup = async (id: string) => {
      try {
        await deleteVideoDraftAssets(r2, privateEndpoint, publicEndpoint, id);
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
        body.size < 1 || body.size > 60 * 1024 * 1024) {
        return json({ error: 'Choose an MP4 video no larger than 60 MB.' }, 400);
      }
      const jobId = await rpc('reserve_product_video', { p_product_id: body.productId, p_bytes: body.size });
      return json({ jobId });
    }
    if (body.action === 'upload') {
      if (!binary || !uuid.test(body.jobId)) return json({ error: 'Invalid video upload.' }, 400);
      const [job] = await rpc('begin_product_video_upload', { p_job_id: body.jobId });
      const finish = (error?: string) => serviceRpc('finish_product_video_upload', {
        p_job_id: job.id, p_lease: job.lease, p_error: error ?? null,
      });
      try {
        const bytes = await readUpload(request, job.source_bytes);
        const response = await r2.fetch(`${privateEndpoint}/making-videos/${job.id}/original.mp4`, {
          method: 'PUT', body: bytes, headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store' },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Private video upload failed (HTTP ${response.status}).`);
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
