import { expect, it } from 'vitest';
import { compressedVideoDimensions, compressProductVideo, supportsVideoCompression } from './videoCompression';

it('fits landscape and portrait videos into 720p with even dimensions and no upscaling', () => {
  expect(compressedVideoDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 });
  expect(compressedVideoDimensions(1080, 1920)).toEqual({ width: 404, height: 720 });
  expect(compressedVideoDimensions(641, 481)).toEqual({ width: 640, height: 480 });
});

it('explicitly rejects optimization without native MP4 recording', async () => {
  expect(supportsVideoCompression()).toBe(false);
  await expect(compressProductVideo(new File(['mp4'], 'video.mp4', { type: 'video/mp4' }), () => {}))
    .rejects.toThrow('Turn off Optimize before upload');
});
