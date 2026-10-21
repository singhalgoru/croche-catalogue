import { validateVideoFile } from './productVideos';

const MIME = 'video/mp4;codecs=avc1.424028';

export const supportsVideoCompression = () =>
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MIME) &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';

export function compressedVideoDimensions(width: number, height: number) {
  const scale = Math.min(1, 1280 / width, 720 / height);
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2),
  };
}

export async function compressProductVideo(file: File, onProgress: (percent: number) => void): Promise<File> {
  validateVideoFile(file);
  if (!supportsVideoCompression()) {
    throw new Error('This browser cannot optimize H.264 MP4. Turn off Optimize before upload to upload the original.');
  }
  if (document.visibilityState === 'hidden') throw new Error('Keep this tab visible while optimizing the video.');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let drawTimer: ReturnType<typeof setInterval> | undefined;
  let onHidden: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Video loading timed out. Try exporting it as H.264 MP4.')), 20_000);
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('This browser cannot decode the selected video. Upload the original or export as H.264 MP4.'));
      video.src = url;
      video.load();
    });
    clearTimeout(timer);
    if (!Number.isFinite(video.duration) || video.duration < 1 || video.duration > 60) {
      throw new Error('Choose a video between 1 and 60 seconds before optimizing.');
    }
    if (!video.videoWidth || !video.videoHeight || video.videoWidth > 4096 || video.videoHeight > 4096) {
      throw new Error('Video dimensions must be no larger than 4096 pixels per axis.');
    }
    const canvas = document.createElement('canvas');
    const dimensions = compressedVideoDimensions(video.videoWidth, video.videoHeight);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video optimization is unavailable. Turn off Optimize before upload to use the original.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    let bytes = 0;
    onProgress(0);
    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => reject(new Error(message));
      timer = setTimeout(() => fail('Video optimization timed out. Upload the original or try another browser.'), 90_000);
      onHidden = () => {
        if (document.visibilityState === 'hidden') fail('Optimization stopped because this tab was hidden. Keep it visible and retry, or upload the original.');
      };
      document.addEventListener('visibilitychange', onHidden);
      video.onerror = () => fail('Video playback failed during optimization. Try uploading the original.');
      recorder!.onerror = () => fail('Video encoding failed. Turn off Optimize before upload to use the original.');
      recorder!.ondataavailable = event => {
        bytes += event.data.size;
        if (bytes > 40 * 1024 * 1024) {
          fail('Optimized video exceeded 40 MB. Upload the original instead.');
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder!.onstop = () => resolve();
      video.onended = () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (recorder?.state === 'recording') recorder.stop();
      };
      drawTimer = setInterval(() => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        onProgress(Math.min(99, Math.floor(video.currentTime / video.duration * 100)));
      }, 1000 / 30);
      recorder!.start(1000);
      void video.play().catch(() => fail('Video playback was blocked. Retry with this tab visible or upload the original.'));
    });
    if (bytes === 0) throw new Error('Optimization produced an empty video. Upload the original instead.');
    onProgress(100);
    // Do not increase the transfer size for originals that are already efficient.
    if (bytes >= file.size) return file;
    return new File(chunks, `${file.name.replace(/\.mp4$/i, '')}-optimized.mp4`, { type: 'video/mp4' });
  } finally {
    clearTimeout(timer);
    clearInterval(drawTimer);
    if (onHidden) document.removeEventListener('visibilitychange', onHidden);
    video.onloadeddata = video.onerror = video.onended = null;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    stream?.getTracks().forEach(track => track.stop());
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
