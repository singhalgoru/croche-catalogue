import { useEffect, useRef, useState } from 'react';
import type { Product } from '../../types/product';
import { discardProductVideo, getProductVideoJob, previewProductVideo, publishProductVideo,
  removeProductVideo, uploadProductVideo, validateMusicFile, type VideoJob, type VideoPreview } from '../../services/productVideos';

export default function ProductVideoManager({ product }: { product: Product }) {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [hasPublished, setHasPublished] = useState(Boolean(product.makingVideo));
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now);
  const [music, setMusic] = useState<File | null>(null);
  const [musicMode, setMusicMode] = useState<'mix' | 'replace'>('mix');
  const [musicRights, setMusicRights] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const previousStatus = useRef('');
  const draft = Boolean(job && !['ready', 'replaced', 'cancelled'].includes(job.status));
  const delayed = job && ['uploading', 'receiving', 'queued', 'processing', 'publishing', 'discarding'].includes(job.status)
    && job.updated_at && now - Date.parse(job.updated_at) > 20 * 60_000;
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const next = await getProductVideoJob(product.id);
        if (alive) {
          if (previousStatus.current === 'discarding' && next?.status === 'cancelled') {
            setMessage('Draft discarded. Its original, music track (if supplied), processed MP4 and poster have been deleted from R2.');
            setError(''); setPreview(null);
          }
          previousStatus.current = next?.status ?? '';
          setJob(next); setChecking(false); setNow(Date.now());
        }
      } catch (reason) {
        if (alive) { setError(reason instanceof Error ? reason.message : 'Unable to check video status.'); setChecking(false); }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [product.id]);
  const refresh = async () => {
    const next = await getProductVideoJob(product.id);
    previousStatus.current = next?.status ?? '';
    setJob(next);
  };
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Video action failed.');
      try { await refresh(); } catch { /* Keep the original actionable error visible. */ }
    } finally { setBusy(false); }
  };
  return (
    <section aria-label="Manage making video" className="rounded-xl border border-cocoa/20 p-3 sm:col-span-2">
      <h4 className="font-semibold text-cocoa">Making video (optional)</h4>
      <p className="my-2 text-sm text-cocoa/75">MP4, H.264 / optional AAC audio, up to 60 MB and 60 seconds.
        Ideally 15–30 seconds, 720p, up to 30 fps. Upload triggers background processing with the Luvia watermark.
        Preview the actual encoded video privately, then explicitly publish it.
        Your existing public video remains unchanged until publication.</p>
      <p role="status" className="my-2 text-sm">
        {busy ? 'Saving video action…' : checking ? 'Checking video status…' :
          job?.status === 'review' ? 'Ready for private review. This draft is not public.' :
          job?.status === 'discarding' ? 'Discard pending. Waiting for active writers and confirmed R2 deletion.' :
          job?.status === 'failed' ? `Video processing failed: ${job.error || 'Discard this draft and retry.'}` :
          draft ? `Video ${job?.status}. You can leave this editor; background work continues.` :
          hasPublished ? 'A published making video is attached.' : 'No published making video attached.'}
        {message && ` ${message}`}
      </p>
      {job?.error && job.status !== 'failed' && <p role="alert" className="my-2 text-sm text-red-700">{job.error}</p>}
      <fieldset disabled={busy || draft || checking} className="my-3 space-y-2 text-sm">
        <legend className="font-semibold">Background music (optional — choose before Browse video)</legend>
        <p>Supply your own owned or licensed MP3, M4A (AAC) or WAV (PCM), up to 20 MB,
          10 minutes, mono/stereo. Audio only; no embedded artwork or video.
          Music loops or trims to the video length, plays quietly at 15% volume and fades in/out.
          Leave empty to keep the original audio unchanged.</p>
        <label className="block">Music file
          <input ref={musicInput} type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,.mp3,.m4a,.wav"
            className="block w-full" onChange={(event) => {
              const track = event.target.files?.[0];
              setMusic(null); setMusicRights(false); setError('');
              if (!track) return;
              try { validateMusicFile(track); setMusic(track); }
              catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Invalid music file.');
                event.target.value = '';
              }
            }} />
        </label>
        {music && <>
          <button type="button" className="underline" onClick={() => {
            setMusic(null); setMusicRights(false);
            if (musicInput.current) musicInput.current.value = '';
          }}>Remove selected music</button>
          <label className="block">Music mode
            <select value={musicMode} onChange={(event) => setMusicMode(event.target.value as 'mix' | 'replace')}>
              <option value="mix">Mix quietly under original audio</option>
              <option value="replace">Replace original audio with music</option>
            </select>
          </label>
          <label className="block">
            <input type="checkbox" checked={musicRights} onChange={(event) => setMusicRights(event.target.checked)} />
            {' '}I own this music or have permission to use it in this product video.
          </label>
        </>}
        <p>The supplied track is retained privately with the original video, including after publication
          or removal. Explicitly discarding a draft deletes its track too. No automatic deletion policy.</p>
      </fieldset>
      <label className="block text-sm font-semibold">Upload or replace making video
        <input ref={input} type="file" accept="video/mp4,.mp4" disabled={busy || draft || checking || Boolean(music && !musicRights)}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void action(async () => {
              await uploadProductVideo(product.id, file, music
                ? { file: music, mode: musicMode, rightsConfirmed: musicRights } : undefined);
              setPreview(null); await refresh();
              setMessage('Upload received. Processing will create a private review draft, not publish automatically.');
            }).finally(() => { if (input.current) input.current.value = ''; });
          }} />
      </label>
      <button type="button" disabled={busy || draft || checking || Boolean(music && !musicRights)}
        onClick={() => input.current?.click()}
        className="my-2 min-h-11 text-sm font-semibold text-cocoa underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa disabled:cursor-not-allowed disabled:opacity-50">
        Browse video
      </button>
      {job?.status === 'review' && <div className="my-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="rounded-full border border-cocoa/30 px-4 py-2 text-sm"
          onClick={() => void action(async () => { setPreview(await previewProductVideo(job.id)); })}>
          {preview ? 'Refresh private preview' : 'Preview processed video'}
        </button>
        <button type="button" disabled={busy || !preview} className="rounded-full bg-cocoa px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => void action(async () => {
            await publishProductVideo(job.id); setHasPublished(true); setPreview(null); await refresh();
            setMessage('Video published. Reload the catalogue to see it.');
          })}>Publish video</button>
      </div>}
      {preview && job?.status === 'review' && <div className="my-3">
        <video src={preview.videoUrl} poster={preview.posterUrl} controls controlsList="nodownload"
          playsInline preload="none" width={preview.width} height={preview.height}
          aria-label="Private processed making video preview" className="max-h-96 w-full rounded-lg bg-cream"
          onError={() => setError('Private preview expired or could not be played. Refresh the private preview and try again.')} />
        <p className="mt-2 text-sm">{preview.durationSeconds.toFixed(1)} seconds · {(preview.videoBytes / 1024 / 1024).toFixed(1)} MB
          · {preview.width}×{preview.height}. Private preview links expire after five minutes.
          The source is unchanged; this branded video and its poster are exactly what publication will use.</p>
      </div>}
      <div className="my-2 flex flex-wrap gap-2">
        {draft && <button type="button" disabled={busy || checking}
          className="rounded-full border border-red-500 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
          onClick={() => void action(async () => {
            const result = await discardProductVideo(product.id);
            setPreview(null); await refresh();
            setMessage(result.discarded
              ? 'Draft discarded. Its original, music track (if supplied), processed MP4 and poster have been deleted from R2. The published video is unchanged.'
              : 'Discard requested; deletion is not complete yet. Active writers will clean up before confirming success.');
          })}>{job?.status === 'discarding' ? 'Retry discard cleanup' : 'Discard draft (delete original and processed files)'}</button>}
        <button type="button" disabled={busy || checking || !hasPublished}
          className="rounded-full border border-cocoa/30 px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => void action(async () => {
            await removeProductVideo(product.id); setHasPublished(false);
            setMessage('Published video detached. Private drafts and retained files are unchanged.');
          })}>Remove published video</button>
      </div>
      <p className="mt-2 text-xs text-cocoa/65">Video changes save independently of the product form.
        No automatic file-retention/deletion policy is enabled. Discard explicitly deletes only the draft’s
        original, supplied music and processed assets, never the current published video. Watermarking is a deterrent, not DRM.</p>
      {delayed && <p role="alert" className="mt-2 text-sm text-red-700">
        Processing is taking longer than expected. Check the “Process product making videos” GitHub workflow
        for errors, or retry draft discard cleanup. The existing published video is unchanged.
      </p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
