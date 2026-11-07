// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

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
