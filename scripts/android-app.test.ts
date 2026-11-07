// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import sharp from 'sharp';

it('keeps the Android shop wrapper aligned with its public origin and Play target', () => {
  const config = JSON.parse(readFileSync('android/twa-manifest.json', 'utf8'));
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  const androidManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const assetStatements = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  expect(config.host).toBe('luviacreations.com');
  expect(config.startUrl).toMatch(/^\/(?!\/)/);
  expect(config.fallbackType).toBe('customtabs');
  expect(config.enableNotifications).toBe(false);
  expect(config.minSdkVersion).toBeGreaterThanOrEqual(24);
  expect(gradle).toContain(`applicationId "${config.packageId}"`);
  expect(gradle).toContain(`minSdkVersion ${config.minSdkVersion}`);
  expect(gradle).toContain(`launchUrl: '${config.startUrl}'`);
  expect(gradle).toContain(`fallbackType: '${config.fallbackType}'`);
  expect(Number(gradle.match(/targetSdkVersion\s+(\d+)/)?.[1])).toBeGreaterThanOrEqual(36);
  expect(androidManifest).toContain('android:autoVerify="true"');
  expect(assetStatements).toContain(`https://${config.host}`);
});

it('provides an adaptive launcher icon with a cream background and safe-zone artwork at every density', async () => {
  const adaptive = readFileSync('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', 'utf8');
  const colors = readFileSync('android/app/src/main/res/values/launcher_colors.xml', 'utf8');
  expect(adaptive).toContain('@color/launcher_background');
  expect(adaptive).toContain('@mipmap/ic_launcher_foreground');
  expect(colors).toContain('#fdf6ec');

  for (const [density, size] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]] as const) {
    const base = `android/app/src/main/res/mipmap-${density}`;
    const foreground = await sharp(`${base}/ic_launcher_foreground.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([foreground.info.width, foreground.info.height]).toEqual([size, size]);
    const alpha = (x: number, y: number) => foreground.data[(y * size + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(Math.floor(size / 2), Math.floor(size / 2))).toBe(255);
    const legacy = await sharp(`${base}/ic_launcher.png`).ensureAlpha().raw().toBuffer();
    expect([...legacy.subarray(0, 4)]).toEqual([253, 246, 236, 255]);
  }
});
