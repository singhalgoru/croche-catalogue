import { createWorker, OEM } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

export async function extractPhotoQuote(file: File, onProgress: (message: string) => void): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 6 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP review image up to 6 MB.');
  }
  const image = await createImageBitmap(file);
  const pixels = image.width * image.height;
  image.close();
  if (pixels > 20_000_000) throw new Error('The review image is too large to read safely. Crop it to the message first.');
  onProgress('Loading the local English text reader...');
  let rejectFailure!: (reason: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; });
  const timeout = setTimeout(() => rejectFailure(new Error('Text reading timed out. Try a smaller, clearer crop.')), 60000);
  const pendingWorker = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath, corePath, langPath: `${location.origin}${import.meta.env.BASE_URL}ocr/eng-v1`,
    workerBlobURL: false, cacheMethod: 'none',
    logger: message => {
      if (message.status === 'recognizing text') onProgress(`Reading text: ${Math.round(message.progress * 100)}%`);
    },
    errorHandler: () => rejectFailure(new Error('Unable to initialise or run the local text reader. Reload and try a clearer crop.')),
  });
  let worker: Awaited<typeof pendingWorker> | undefined;
  try {
    worker = await Promise.race([pendingWorker, failure]);
    const result = await Promise.race([worker.recognize(file), failure]);
    const text = result.data.text.trim();
    if (!text) throw new Error('No readable text found. Try a clearer image cropped to the customer message.');
    return text;
  } finally {
    clearTimeout(timeout);
    if (worker) await worker.terminate();
    else void pendingWorker.then(lateWorker => lateWorker.terminate(),
      () => console.error('The local text reader failed to initialise.'));
  }
}
