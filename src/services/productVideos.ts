import { loadSupabase } from '../lib/supabaseConfig';
import { getImageStorageErrorMessage } from './r2ImageStorage';

export interface VideoJob {
  id: string;
  status: 'uploading' | 'receiving' | 'queued' | 'processing' | 'review' | 'publishing' | 'ready' | 'failed' | 'discarding' | 'cancelled' | 'replaced';
  error: string | null;
  updated_at?: string;
}

export interface VideoPreview {
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  videoBytes: number;
  expiresAt: string;
}

async function client() {
  const db = await loadSupabase();
  if (!db) throw new Error('Supabase is not configured.');
  return db;
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await (await client()).functions.invoke('product-videos', { body });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  if (!data || data.error) throw new Error(data?.error || 'Invalid video storage response.');
  return data;
}

export function validateVideoFile(file: File) {
  if (!/\.mp4$/i.test(file.name) || !['', 'application/octet-stream', 'video/mp4'].includes(file.type)) {
    throw new Error(`"${file.name}" is not a supported MP4 upload (reported type: ${file.type || 'unknown'}). Export as MP4 with H.264 video and AAC audio; renaming the file is not enough.`);
  }
  if (file.size < 1) throw new Error(`"${file.name}" is empty. Choose a non-empty MP4 video.`);
  if (file.size > 500 * 1024 * 1024) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB. Originals can be up to 500 MB (clips must still be 1–60 seconds). Choose a smaller MP4 and try again.`);
  }
}

// Source audio is always removed. Music is either the private Luvia default
// track (installed server-side; never downloaded by the browser) or an
// admin-supplied file. Omit music for a video with no audio stream.
export type VideoMusic = { source: 'brand' } | { file: File; rightsConfirmed: boolean };

export function validateMusicFile(file: File) {
  const extensions: Record<string, RegExp> = {
    'audio/mpeg': /\.mp3$/i, 'audio/mp4': /\.m4a$/i,
    'audio/wav': /\.wav$/i, 'audio/x-wav': /\.wav$/i,
  };
  if (!extensions[file.type]?.test(file.name) || file.size < 1 || file.size > 20 * 1024 * 1024) {
    throw new Error('Choose an MP3, M4A or WAV audio file no larger than 20 MB.');
  }
}

export interface VideoUploadProgress {
  stage: 'preparing' | 'video' | 'music' | 'finalizing';
  uploadedBytes: number;
  totalBytes: number;
}

export async function uploadProductVideo(
  productId: string,
  file: File,
  music?: VideoMusic,
  onProgress?: (progress: VideoUploadProgress) => void,
) {
  validateVideoFile(file);
  const custom = music && 'file' in music ? music : undefined;
  if (music && !custom && !('source' in music && music.source === 'brand')) throw new Error('Choose a valid music option.');
  if (custom) {
    validateMusicFile(custom.file);
    if (!custom.rightsConfirmed) throw new Error('Confirm that you own or have permission to use this music.');
  }
  const report = (stage: VideoUploadProgress['stage'], uploadedBytes: number) =>
    onProgress?.({ stage, uploadedBytes, totalBytes: file.size });
  report('preparing', 0);
  const { jobId } = await invoke({ action: 'prepare', productId, size: file.size, type: 'video/mp4',
    ...(custom ? { music: { size: custom.file.size, type: custom.file.type, mode: 'replace',
      rightsConfirmed: custom.rightsConfirmed } } : music ? { music: { source: 'brand' } } : {}),
  });
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Invalid video upload response.');
  const started = await invoke({ action: 'start', jobId });
  if (started.started !== true) throw new Error('Video upload did not start. Discard the draft and retry.');
  const upload = async (action: 'part' | 'music', body: Blob, part?: number) => {
    const { data, error } = await (await client()).functions.invoke(
      `product-videos?jobId=${jobId}&action=${action}${part ? `&part=${part}` : ''}`, {
        body, headers: { 'Content-Type': 'application/octet-stream' },
      });
    if (error) throw new Error(await getImageStorageErrorMessage(error));
    if (data?.uploaded !== true) throw new Error(data?.error || 'Video upload did not complete. Discard the draft and retry.');
  };
  // File slices are sent sequentially: no whole-original read/concatenation and
  // no R2 browser CORS configuration or revocation-unsafe signed PUTs.
  const partBytes = 8 * 1024 * 1024;
  for (let offset = 0, part = 1; offset < file.size; offset += partBytes, part++) {
    report('video', offset);
    await upload('part', file.slice(offset, Math.min(offset + partBytes, file.size)), part);
    report('video', Math.min(offset + partBytes, file.size));
  }
  if (custom) {
    report('music', file.size);
    await upload('music', custom.file);
  }
  report('finalizing', file.size);
  const completed = await invoke({ action: 'complete', jobId });
  if (completed.queued !== true) throw new Error(completed.error || 'Video upload did not complete. Discard the draft and retry.');
  return jobId as string;
}

export async function removeProductVideo(productId: string) {
  const data = await invoke({ action: 'remove', productId });
  if (data.removed !== true) throw new Error('Video removal was not confirmed. Reload the status before retrying.');
}

export async function renameProductVideo(productId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if ([...trimmed].length > 120) throw new Error('Video title must be at most 120 characters.');
  const { error } = await (await client()).rpc('rename_product_video', {
    p_product_id: productId, p_title: trimmed,
  });
  if (error) throw new Error(`Unable to rename the video: ${error.message}`);
}

export async function discardProductVideo(productId: string): Promise<{ discarded: boolean; pending?: boolean }> {
  const data = await invoke({ action: 'discard', productId });
  if (data.discarded !== true && data.pending !== true) throw new Error('Draft deletion was not confirmed. Retry discard cleanup.');
  return data;
}

export async function previewProductVideo(jobId: string): Promise<VideoPreview> {
  const data = await invoke({ action: 'preview', jobId });
  const validUrl = (value: unknown) => {
    try {
      return typeof value === 'string' && new URL(value).protocol === 'https:'
        && new URL(value).hostname.endsWith('.r2.cloudflarestorage.com');
    } catch { return false; }
  };
  if (!validUrl(data.videoUrl) || !validUrl(data.posterUrl) ||
      !Number.isFinite(data.durationSeconds) || data.durationSeconds <= 0 ||
      !Number.isFinite(data.videoBytes) || data.videoBytes <= 0 ||
      !Number.isFinite(data.width) || data.width < 2 || !Number.isFinite(data.height) || data.height < 2) {
    throw new Error('Private preview returned invalid media metadata. Refresh the preview and try again.');
  }
  return data;
}

export async function reprocessProductVideo(jobId: string, music: 'keep' | 'brand' | 'none' = 'keep') {
  const data = await invoke({ action: 'reprocess', jobId, music });
  if (data.queued !== true) throw new Error('Reprocessing was not confirmed. Reload the status before retrying.');
}

export async function publishProductVideo(jobId: string) {
  const data = await invoke({ action: 'publish', jobId });
  if (data.published !== true) throw new Error('Video publication was not confirmed. Reload the status before retrying.');
}

export async function getProductVideoJob(productId: string): Promise<VideoJob | null> {
  const { data, error } = await (await client()).from('product_video_jobs')
    .select('id,status,error,updated_at').eq('product_id', productId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Unable to check video processing: ${error.message}`);
  return data as VideoJob | null;
}
