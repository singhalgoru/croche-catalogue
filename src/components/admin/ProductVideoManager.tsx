import { useEffect, useRef, useState } from 'react';
import type { Product } from '../../types/product';
import { discardProductVideo, getProductVideoJob, previewProductVideo, publishProductVideo, removeProductVideo,
  reprocessProductVideo, uploadProductVideo, validateMusicFile, type VideoJob, type VideoMusic,
  type VideoPreview } from '../../services/productVideos';

type MusicChoice = 'brand' | 'custom' | 'none';
const browseClass = 'min-h-11 text-sm font-semibold text-cocoa underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa disabled:cursor-not-allowed disabled:opacity-50';

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
  const [musicChoice, setMusicChoice] = useState<MusicChoice>('brand');
  const [musicRights, setMusicRights] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const previousStatus = useRef('');
  const draft = Boolean(job && !['ready', 'replaced', 'cancelled'].includes(job.status));
  const reviewing = job?.status === 'review';
  const musicBlocked = musicChoice === 'custom' && !(music && musicRights);
  const selectedMusic = (): VideoMusic | undefined => musicChoice === 'brand' ? { source: 'brand' }
    : musicChoice === 'custom' && music ? { file: music, rightsConfirmed: musicRights } : undefined;
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
      <p className="my-2 text-sm text-cocoa/75">MP4, H.264 video, originals up to 500 MB and 60 seconds.
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
      <fieldset disabled={busy || checking || (draft && !reviewing)} className="my-3 space-y-2 text-sm">
        <legend className="font-semibold">Background music (choose before Browse video)</legend>
        <p>The original sound of every video (speech, room or background noise) is always removed.
          The processed video plays only the music chosen here, looped or trimmed to the video length
          at 15% volume with short fades. Choose No music for a silent video with no audio track.</p>
        {([['brand', 'Luvia gentle instrumental (default)'], ['custom', 'Upload my own music'],
          ['none', 'No music (silent video, no audio track)']] as const).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input type="radio" name={`making-video-music-${product.id}`} value={value}
              checked={musicChoice === value} onChange={() => { setMusicChoice(value); setError(''); }} />
            {label}
          </label>
        ))}
        {musicChoice === 'custom' && <fieldset disabled={draft} className="space-y-2 border-l-2 border-cocoa/20 pl-3">
          <p>Owned or licensed MP3, M4A (AAC) or WAV (PCM), up to 20 MB, 10 minutes, mono/stereo.
            Audio only; no embedded artwork or video. It replaces the default track.</p>
          <input ref={musicInput} type="file" aria-label="Music file" tabIndex={-1} className="sr-only"
            accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,.mp3,.m4a,.wav"
            onChange={(event) => {
              const track = event.target.files?.[0];
              // An empty change (picker dismissed) keeps the current selection.
              if (!track) return;
              setError('');
              try { validateMusicFile(track); setMusic(track); setMusicRights(false); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid music file.'); }
              finally { event.target.value = ''; }
            }} />
          {music && <p>Selected audio: <span className="font-semibold">{music.name}</span>
            {' '}({(music.size / 1024 / 1024).toFixed(1)} MB)</p>}
          <div className="flex flex-wrap gap-4">
            <button type="button" className={browseClass} onClick={() => musicInput.current?.click()}>
              {music ? 'Change audio' : 'Browse audio'}
            </button>
            {music && <button type="button" className={browseClass} onClick={() => {
              setMusic(null); setMusicRights(false);
              if (musicInput.current) musicInput.current.value = '';
            }}>Remove audio</button>}
          </div>
          {music && <label className="block">
            <input type="checkbox" checked={musicRights} onChange={(event) => setMusicRights(event.target.checked)} />
            {' '}I own this music or have permission to use it in this product video.
          </label>}
          {!draft && musicBlocked && <p>Browse audio and confirm permission, or choose another music option.</p>}
        </fieldset>}
        <p>A supplied track is retained privately with the original video, including after publication
          or removal. Explicitly discarding a draft deletes its track too. No automatic deletion policy.</p>
      </fieldset>
      <label className="block text-sm font-semibold">Upload or replace making video
        <input ref={input} type="file" accept="video/mp4,.mp4" disabled={busy || draft || checking || musicBlocked}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file || musicBlocked) return;
            void action(async () => {
              await uploadProductVideo(product.id, file, selectedMusic());
              setPreview(null); await refresh();
              setMessage('Upload received. Processing will create a private review draft, not publish automatically.');
            }).finally(() => { if (input.current) input.current.value = ''; });
          }} />
      </label>
      <button type="button" disabled={busy || draft || checking || musicBlocked}
        onClick={() => input.current?.click()} className={`my-2 ${browseClass}`}>
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
        <button type="button" disabled={busy} className="rounded-full border border-cocoa/30 px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => void action(async () => {
            setPreview(null);
            await reprocessProductVideo(job.id, musicChoice === 'custom' ? 'keep' : musicChoice);
            await refresh();
            setMessage('Reprocessing from the retained original without re-upload. Original sound is removed; preview the new draft before publishing. The published video is unchanged.');
          })}>Reprocess draft</button>
        <p className="w-full text-xs text-cocoa/75">Reprocess draft applies the music option above: the Luvia default or
          No music. Upload my own music keeps this draft&apos;s previously supplied track (or no audio if none).
          The original is kept until publication succeeds, then automatically deleted.</p>
      </div>}
      {preview && job?.status === 'review' && <div className="my-3">
        <video src={preview.videoUrl} poster={preview.posterUrl} controls controlsList="nodownload"
          playsInline preload="none" width={preview.width} height={preview.height}
          aria-label="Private processed making video preview" style={{ aspectRatio: `${preview.width} / ${preview.height}`,
            maxWidth: `${Math.round(384 * preview.width / preview.height)}px` }}
          className="mx-auto block h-auto max-h-96 w-full rounded-lg bg-cream object-contain"
          onError={() => setError('Private preview expired or could not be played. Refresh the private preview and try again.')} />
        <p className="mt-2 text-sm">{preview.durationSeconds.toFixed(1)} seconds · {(preview.videoBytes / 1024 / 1024).toFixed(1)} MB
          · {preview.width}×{preview.height}. Private preview links expire after five minutes.
          This branded video and its poster are exactly what publication will use; the uploaded original is deleted only after publication succeeds.</p>
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
