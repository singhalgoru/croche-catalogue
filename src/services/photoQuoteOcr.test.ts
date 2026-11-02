import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorker } from 'tesseract.js';
import { extractPhotoQuote } from './photoQuoteOcr';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn(), OEM: { LSTM_ONLY: 1 } }));
const recognize = vi.fn();
const terminate = vi.fn();
const close = vi.fn();
const file = () => new File(['synthetic'], 'review.png', { type: 'image/png' });
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1000, height: 300, close }));
  vi.mocked(createWorker).mockResolvedValue({ recognize, terminate, load: vi.fn(), writeText: vi.fn(),
    readText: vi.fn(), removeText: vi.fn(), FS: vi.fn(), reinitialize: vi.fn(), setParameters: vi.fn(),
    getImage: vi.fn(), detect: vi.fn() });
  recognize.mockResolvedValue({ data: { text: ' A lovely handmade keepsake! \n' } });
  terminate.mockResolvedValue(undefined);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('uses only configured local assets and terminates the worker after recognition', async () => {
  expect(await extractPhotoQuote(file(), vi.fn())).toBe('A lovely handmade keepsake!');
  expect(createWorker).toHaveBeenCalledWith('eng', 1, expect.objectContaining({
    workerBlobURL: false, cacheMethod: 'none', langPath: expect.stringContaining('/ocr/eng-v1'),
  }));
  expect(recognize).toHaveBeenCalledWith(expect.any(File));
  expect(terminate).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it('rejects unsupported, empty and oversized files before creating a worker', async () => {
  await expect(extractPhotoQuote(new File(['x'], 'image.svg', { type: 'image/svg+xml' }), vi.fn())).rejects.toThrow('JPG');
  await expect(extractPhotoQuote(new File([], 'image.png', { type: 'image/png' }), vi.fn())).rejects.toThrow('6 MB');
  await expect(extractPhotoQuote(new File([new Uint8Array(6 * 1024 * 1024 + 1)], 'image.png', { type: 'image/png' }), vi.fn())).rejects.toThrow('6 MB');
  expect(createWorker).not.toHaveBeenCalled();
});
it('rejects excessive pixel dimensions and releases the decoded image', async () => {
  vi.mocked(createImageBitmap).mockResolvedValueOnce({ width: 5000, height: 5000, close } as ImageBitmap);
  await expect(extractPhotoQuote(file(), vi.fn())).rejects.toThrow('Crop');
  expect(close).toHaveBeenCalledOnce();
  expect(createWorker).not.toHaveBeenCalled();
});
it('surfaces blank results and recognition failures while terminating the worker', async () => {
  recognize.mockResolvedValueOnce({ data: { text: ' \n' } }).mockRejectedValueOnce(new Error('Read failed'));
  await expect(extractPhotoQuote(file(), vi.fn())).rejects.toThrow('No readable text');
  await expect(extractPhotoQuote(file(), vi.fn())).rejects.toThrow('Read failed');
  expect(terminate).toHaveBeenCalledTimes(2);
});
