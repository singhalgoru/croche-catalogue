// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import sharp from 'sharp';

it('associates the website with the current Android test signing certificate', () => {
  const config = JSON.parse(readFileSync('android/twa-manifest.json', 'utf8'));
  const associations = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  expect(associations).toEqual([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: config.packageId,
      sha256_cert_fingerprints: [
        'F8:1D:20:64:46:9D:41:7C:A2:CE:AD:FF:B2:D7:B9:E3:86:35:B0:5D:0C:67:EF:4B:EA:3C:15:5E:91:39:56:B7',
      ],
    },
  }]);
});

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

it('uses transparent splash corners over the configured cream background at every density', async () => {
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  expect(gradle).toMatch(/backgroundColor:\s*'#FDF6EC'/i);
  expect(manifest).toContain('android:resource="@drawable/splash"');
  expect(manifest).toContain('android:resource="@color/backgroundColor"');

  for (const [density, size] of [['mdpi', 300], ['hdpi', 450], ['xhdpi', 600], ['xxhdpi', 900], ['xxxhdpi', 1200]] as const) {
    const splash = await sharp(`android/app/src/main/res/drawable-${density}/splash.png`)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([splash.info.width, splash.info.height]).toEqual([size, size]);
    const alpha = (x: number, y: number) => splash.data[(y * size + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
      expect(alpha(x, y)).toBe(0);
    }
    expect(alpha(Math.floor(size / 2), Math.floor(size / 2))).toBe(255);
  }
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
