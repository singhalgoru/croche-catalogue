import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('optimizes a real MP4 locally before uploading a smaller decodable file', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('http://supabase.test/rest/v1/product_video_jobs*', route => route.fulfill({ json: null }));
  const parts: Buffer[] = [];
  let reservedSize = 0;
  await page.route('http://supabase.test/functions/v1/product-videos*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'part') {
      parts.push(route.request().postDataBuffer()!);
      return route.fulfill({ json: { uploaded: true } });
    }
    const body = route.request().postDataJSON();
    if (body.action === 'prepare') reservedSize = body.size;
    return route.fulfill({ json: body.action === 'prepare'
      ? { jobId: '11111111-1111-4111-8111-111111111111' }
      : body.action === 'start' ? { started: true } : { queued: true } });
  });
  await page.goto('./#admin');
  const source = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 900;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.424028' });
    const chunks: Blob[] = [];
    const done = new Promise<Blob>(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
    });
    recorder.start();
    const timer = setInterval(() => {
      context.fillStyle = '#984444';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffffff';
      context.fillRect(Date.now() % 1000, 100, 100, 100);
    }, 33);
    await new Promise(resolve => setTimeout(resolve, 2100));
    recorder.stop();
    const blob = await done;
    clearInterval(timer);
    stream.getTracks().forEach(track => track.stop());
    // Valid free-space MP4 box simulates an unnecessarily large original.
    const padding = new Uint8Array(2 * 1024 * 1024);
    const view = new DataView(padding.buffer);
    view.setUint32(0, padding.length);
    padding.set([102, 114, 101, 101], 4);
    const bytes = new Uint8Array(await new Blob([blob, padding]).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit', exact: true }).click();
  const manager = page.getByRole('region', { name: 'Manage making video' });
  await manager.getByLabel('Optimize before upload (720p MP4)').check();
  await manager.getByLabel('Upload or replace making video').setInputFiles({
    name: 'large.mp4', mimeType: 'video/mp4', buffer: Buffer.from(source, 'base64'),
  });
  await expect(manager.getByRole('status')).toContainText('Upload received', { timeout: 20_000 });
  expect(reservedSize).toBeGreaterThan(0);
  expect(reservedSize).toBeLessThan(Buffer.from(source, 'base64').length);
  const encoded = Buffer.concat(parts);
  expect(encoded.length).toBe(reservedSize);
  const output = await page.evaluate(async base64 => {
    const video = document.createElement('video');
    const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Encoded MP4 could not be decoded'));
        video.src = url;
      });
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
  }, encoded.toString('base64'));
  expect(output.width).toBe(1280);
  expect(output.height).toBe(720);
  expect(output.duration).toBeGreaterThan(1);
  expect(output.duration).toBeLessThan(4);
});
