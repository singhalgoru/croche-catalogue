import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { convertToHtml, extractRawText } from 'mammoth';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from 'docx';
import { installMockSupabase } from './mockSupabase';

test('admin can manage a private product reference video link', async ({ page }) => {
  const state = await installMockSupabase(page);
  const product = state.products[0];
  let saved: string | null = null;
  await page.route('**/rest/v1/rpc/read_product_reference_video', async route => {
    expect(route.request().postDataJSON().target_product).toBe(product.id);
    await route.fulfill({ json: saved });
  });
  await page.route('**/rest/v1/rpc/save_product_reference_video', async route => {
    const body = route.request().postDataJSON();
    expect(body.target_product).toBe(product.id);
    expect(body.expected_url).toBe(saved);
    saved = body.new_url;
    await route.fulfill({ json: saved });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: product.name, exact: true }) });
  await card.getByRole('button', { name: 'Reference video' }).click();
  let dialog = page.getByRole('dialog', { name: `Reference video - ${product.name}` });
  await dialog.getByLabel('Video link').fill('https://youtu.be/example');
  await dialog.getByRole('button', { name: 'Save link' }).click();
  await expect(dialog.getByText('Reference video link saved.')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open saved video' })).toHaveAttribute('href', 'https://youtu.be/example');
  await dialog.getByRole('button', { name: `Close Reference video - ${product.name}` }).click();
  await card.getByRole('button', { name: 'Reference video' }).click();
  dialog = page.getByRole('dialog', { name: `Reference video - ${product.name}` });
  await expect(dialog.getByLabel('Video link')).toHaveValue('https://youtu.be/example');
  await dialog.getByRole('button', { name: 'Remove link' }).click();
  await dialog.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(dialog.getByText('Reference video link removed.')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open saved video' })).toHaveCount(0);
  expect(saved).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('product summary cards fill each row as the viewport changes', async ({ page }) => {
  const state = await installMockSupabase(page);
  const base = state.products[0];
  const costs = { gst_percent: 5, time_spent: 0, time_unit: 'hours', material_cost: 0,
    shipping_cost: 0, packaging_cost: 0, target_margin_percent: 20 };
  state.products = [
    { ...base, id: 'low-margin', name: 'Low margin', product_variants: [], product_profit_margins: { ...costs, profit_margin_percent: 10 } },
    { ...base, id: 'negative-margin', name: 'Negative margin', product_variants: [], product_profit_margins: { ...costs, profit_margin_percent: -5 } },
    { ...base, id: 'hidden-product', name: 'Hidden product', published: false, product_variants: [], product_profit_margins: { ...costs, profit_margin_percent: 25 } },
  ];
  await page.goto('./#admin');
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const summary = page.getByRole('region', { name: 'Products needing attention' });
  await expect(summary.getByRole('button', { name: '1 0% to below 20% margin' })).toBeVisible();
  await expect(summary.getByRole('button', { name: '1 Negative margin' })).toBeVisible();
  await expect(summary.getByRole('button', { name: '1 20% or higher margin' })).toBeVisible();
  await expect(summary.getByRole('button', { name: '1 Hidden products' })).toBeVisible();
  await expect(summary.getByRole('button', { name: '3 Low / out of stock' })).toBeVisible();
  await expect(summary.getByRole('button', { name: '3 No pattern attached' })).toBeVisible();
  for (const width of [1600, 800, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const buttonName of ['1 Hidden products', '3 No pattern attached']) {
      const gap = await summary.getByRole('button', { name: buttonName }).evaluate(button =>
        button.parentElement!.getBoundingClientRect().right - button.getBoundingClientRect().right);
      expect(Math.abs(gap)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

for (const { language, merged } of [
  { language: 'en', merged: false }, { language: 'hi', merged: false }, { language: 'en', merged: true },
] as const) {
test(`admin attaches a private editable pattern and emails only a protected PDF (${language}${merged ? ', merged headings' : ''})`, async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const state = await installMockSupabase(page);
  const photo = await sharp({ create: { width: 240, height: 180, channels: 3, background: '#f6c453' } }).png().toBuffer();
  await page.route('http://supabase.test/storage/v1/object/public/product-images/**',
    route => route.fulfill({ contentType: 'image/png', body: photo }));
  const product = state.products[0];
  if (language === 'en') product.sku = 'LUV-000001';
  const document = readFileSync(join('public', 'templates', 'Luvia_Standard_Crochet_Pattern_v4.docx'));
  const sourceDocument = merged ? await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: 'Crochet Lotus Flower', heading: HeadingLevel.TITLE }),
    new Paragraph('Pattern ID: OLD-PATTERN-ID'), new Paragraph('Prepared by: Other company'),
    new Paragraph({ text: '1. Reference & construction', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Work in rounds. Do not turn.'),
    new Paragraph({ text: '3. Abbreviations & special stitches', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('US terms: ch = chain; Ch 3 Picot = ch 3, join into the third chain.'),
    new Paragraph({ text: '5. Instructions', heading: HeadingLevel.HEADING_1 }),
    new Table({ rows: [
      new TableRow({ children: ['Round', 'Instructions / repeats', 'Count'].map(text =>
        new TableCell({ children: [new Paragraph(text)] })) }),
      new TableRow({ children: [new TableCell({ columnSpan: 3, children: [new Paragraph('Centre - Yellow')] })] }),
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph('R1')] }),
        new TableCell({ children: [new Paragraph('Work into the ring.'), new Paragraph('Repeat, then join.')] }),
        new TableCell({ children: [new Paragraph('10 hdc')] }),
      ] }),
      new TableRow({ children: [
        new TableCell({ columnSpan: 2, children: [new Paragraph('Petal rounds')] }),
        new TableCell({ children: [new Paragraph('8 petals')] }),
      ] }),
    ] }),
  ] }] })) : document;
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
  const template = await page.request.get('/templates/Luvia_Standard_Crochet_Pattern_v4.docx');
  expect(template.ok()).toBe(true);
  expect(await template.body()).toEqual(document);
  await dialog.getByRole('combobox', { name: 'Document language', exact: true }).selectOption(language);
  if (language === 'hi') {
    await dialog.getByRole('combobox', { name: 'Pattern source', exact: true }).selectOption('write');
    await dialog.getByLabel('पैटर्न के निर्देश (हिन्दी)').fill(
      'कमल का फूल\nपैटर्न ID: OLD-PATTERN-ID\nतैयार किया: Other company\nR1: 5 चेन बनाएं।\nR2: 16 hdc बनाएं।');
  } else {
    const wordPicker = dialog.getByLabel('Choose Word pattern (.docx, up to 2 MB)');
    await expect(wordPicker).toHaveCSS('cursor', 'pointer');
    expect(await wordPicker.evaluate(input => getComputedStyle(input, '::file-selector-button').textDecorationLine))
      .toContain('underline');
    await wordPicker.setInputFiles({
      name: 'Completed_Lotus.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: sourceDocument,
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
  const { value: wordText } = await extractRawText({ buffer: Buffer.from(attachment, 'base64') });
  expect(wordText).not.toContain(`${product.name}-${product.sku ?? product.id}`);
  expect(wordText).not.toMatch(/Pattern ID|पैटर्न ID/i);
  expect(wordText.split(`${language === 'hi' ? 'तैयार किया' : 'Prepared by'}: Luvia Creations`)).toHaveLength(2);
  expect(wordText).not.toContain('Pattern ID / revision / date');
  if (language === 'en' && !merged) expect(wordText).toContain('Revision / date');
  expect(wordText).not.toContain('Assigned automatically during admin preparation');
  expect(wordText).not.toContain('Other company');
  expect(wordText).not.toContain('OLD-PATTERN-ID');
  expect(wordText).not.toMatch(/reviewed by/i);
  expect(wordText).not.toContain("[Insert this product's main photo]");
  expect(wordText).not.toContain('[Insert approved product photos and colour references here.]');
  expect(wordText).not.toContain('[Paste the product page URL]');
  expect(wordText.match(/Copyright © Luvia Creations/g)?.length ?? 0).toBe(language === 'en' ? 1 : 0);
  expect(wordText).not.toContain('Copyright (c) Luvia Creations');
  const { value: wordHtml } = await convertToHtml({ buffer: Buffer.from(attachment, 'base64') });
  if (language === 'en') {
    const tables = wordHtml.match(/<table>[\s\S]*?<\/table>/g) ?? [];
    expect(tables.some(table => table.includes('Construction details'))).toBe(true);
    expect(wordText).not.toContain('Document control');
    if (!merged) expect(wordText).toContain('Pattern details');
    const abbreviations = tables.find(table => table.includes('Abbreviation / stitch'));
    expect(abbreviations).toContain('Meaning / instructions');
    expect(abbreviations).toContain('chain');
  }
  if (merged) {
    expect(wordText).not.toContain('Crochet Lotus Flower');
    expect(wordHtml).toContain('<td colspan="3"><p>Centre - Yellow</p></td>');
    expect(wordHtml).toContain('<td colspan="2"><p>Petal rounds</p></td>');
    expect(wordHtml).toMatch(/Work into the ring\.<br\s*\/?>Repeat, then join\./);
    expect(wordText).toContain('10 hdc');
    expect(wordText).toContain('8 petals');
  }
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
