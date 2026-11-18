import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { installMockSupabase } from './mockSupabase';

for (const language of ['en', 'hi'] as const) {
test(`admin attaches a private editable pattern and emails only a protected PDF (${language})`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const state = await installMockSupabase(page);
  const photo = await sharp({ create: { width: 240, height: 180, channels: 3, background: '#f6c453' } }).png().toBuffer();
  await page.route('http://supabase.test/storage/v1/object/public/product-images/**',
    route => route.fulfill({ contentType: 'image/png', body: photo }));
  const product = state.products[0];
  const document = readFileSync(join('public', 'templates', 'Luvia_Standard_Crochet_Pattern_v3.docx'));
  let pattern: { revision: string; filename: string; size: number; pdf_filename: string; pdf_size: number;
    language: string; updated_at: string } | null = null;
  let attachment = '';
  let pdfAttachment = '';
  const emails: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/product_pattern_workspace', route => route.fulfill({ json: {
    pattern, recipients: [{ id: 'artisan', name: 'Synthetic Maker', email: 'maker@example.test' }], emails,
  } }));
  await page.route('**/rest/v1/rpc/save_product_pattern', async route => {
    const body = route.request().postDataJSON();
    expect(body.target_product).toBe(product.id);
    expect(body.expected_revision).toBeNull();
    attachment = body.document_data;
    expect(Buffer.from(attachment, 'base64').subarray(0, 4)).toEqual(Buffer.from([80, 75, 3, 4]));
    pdfAttachment = body.pdf_data;
    expect(Buffer.from(pdfAttachment, 'base64').toString('latin1')).toContain('/Encrypt');
    expect(body.pattern_language).toBe(language);
    pattern = { revision: body.new_revision, filename: body.document_name, size: Buffer.from(attachment, 'base64').length,
      pdf_filename: body.pdf_name, pdf_size: Buffer.from(pdfAttachment, 'base64').length,
      language, updated_at: '2026-11-18T00:00:00Z' };
    await route.fulfill({ json: body.new_revision });
  });
  await page.route('**/rest/v1/rpc/read_product_pattern', route => route.fulfill({ json: { filename: pattern!.filename, data: attachment } }));
  await page.route('**/rest/v1/rpc/read_product_pattern_pdf', route => route.fulfill({ json: { filename: pattern!.pdf_filename, data: pdfAttachment } }));
  await page.route('**/rest/v1/rpc/queue_product_pattern_email', async route => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ target_product: product.id, expected_revision: pattern!.revision,
      artisan_id: 'artisan', artisan_message: 'Please review this sample before starting.' });
    emails.unshift({ id: body.request_id, recipient_email: 'maker@example.test', filename: pattern!.pdf_filename,
      created_at: '2026-11-18T00:00:00Z', accepted_at: null, attempts: 0, last_error: null });
    await route.fulfill({ json: body.request_id });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  const article = page.getByRole('article').filter({ has: page.getByRole('heading', { name: product.name, exact: true }) });
  await article.getByRole('button', { name: 'Artisan pattern' }).click();
  const dialog = page.getByRole('dialog', { name: `Artisan pattern - ${product.name}` });
  await expect(dialog.getByText('No pattern attached.')).toBeVisible();
  const template = await page.request.get('/templates/Luvia_Standard_Crochet_Pattern_v3.docx');
  expect(template.ok()).toBe(true);
  expect(await template.body()).toEqual(document);
  await dialog.getByRole('combobox', { name: 'Document language', exact: true }).selectOption(language);
  if (language === 'hi') {
    await dialog.getByRole('combobox', { name: 'Pattern source', exact: true }).selectOption('write');
    await dialog.getByLabel('पैटर्न के निर्देश (हिन्दी)').fill('कमल का फूल\nR1: 5 चेन बनाएं।\nR2: 16 hdc बनाएं।');
  } else {
    await dialog.getByLabel('Choose Word pattern (.docx, up to 2 MB)').setInputFiles({
      name: 'Completed_Lotus.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: document,
    });
  }
  await dialog.getByRole('button', { name: 'Prepare and attach pattern documents' }).click();
  await expect(dialog.getByText(/Word master and protected PDF saved privately/)).toBeVisible({ timeout: 20000 });
  expect(emails).toHaveLength(0);
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download attached pattern' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  expect(readFileSync((await download.path())!)).toEqual(Buffer.from(attachment, 'base64'));
  await download.saveAs(testInfo.outputPath(`prepared-${language}.docx`));
  const pdfDownloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Review / download protected PDF' }).click();
  const pdfDownload = await pdfDownloadEvent;
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  expect(readFileSync((await pdfDownload.path())!)).toEqual(Buffer.from(pdfAttachment, 'base64'));
  await pdfDownload.saveAs(testInfo.outputPath(`prepared-${language}.pdf`));
  await dialog.getByRole('combobox', { name: 'Artisan', exact: true }).selectOption('artisan');
  await dialog.getByLabel('Message to artisan (optional)').fill('Please review this sample before starting.');
  await expect(dialog.getByRole('button', { name: 'Queue pattern email' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Queue pattern email' }).click();
  await expect(dialog.getByText(/Pattern email queued/)).toBeVisible();
  expect(emails).toHaveLength(1);
  await dialog.getByText('Recent pattern emails', { exact: true }).click();
  await expect(dialog.getByText(/Queued \/ processing/)).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
}
