import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin renames a published video, retains edits on errors, and customers see the saved title', async ({ page }) => {
  const state = await installMockSupabase(page);
  const video = {
    title: 'Original video title',
    video_url: 'https://videos.luviacreations.com/making-videos/test/video.mp4',
    poster_url: 'https://videos.luviacreations.com/making-videos/test/poster.webp',
    duration_seconds: 15, width: 1280, height: 720,
  };
  state.products[0].product_making_videos = video;
  await page.route('http://supabase.test/rest/v1/product_video_jobs*', route =>
    route.fulfill({ json: null }));
  let fail = true;
  await page.route('http://supabase.test/rest/v1/rpc/rename_product_video', route => {
    if (fail) return route.fulfill({ status: 400, json: { message: 'Title storage unavailable' } });
    const body = route.request().postDataJSON();
    expect(body.p_product_id).toBe(state.products[0].id);
    video.title = body.p_title;
    return route.fulfill({ json: null });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit', exact: true }).click();
  const manager = page.getByRole('region', { name: 'Manage making video' });
  await expect(manager.getByLabel('Video title')).toHaveValue('Original video title');
  await manager.getByLabel('Video title').fill('Handcrafting a rose charm');
  await manager.getByRole('button', { name: 'Save video title' }).click();
  await expect(manager.getByRole('alert')).toContainText('Title storage unavailable');
  await expect(manager.getByLabel('Video title')).toHaveValue('Handcrafting a rose charm');
  fail = false;
  await manager.getByRole('button', { name: 'Save video title' }).click();
  await expect(manager.getByRole('status')).toContainText('Video title saved');
  expect(video.video_url).toBe('https://videos.luviacreations.com/making-videos/test/video.mp4');
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Handcrafting a rose charm', exact: true })).toBeVisible();
});
