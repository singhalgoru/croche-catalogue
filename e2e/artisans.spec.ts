import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { installMockSupabase } from './mockSupabase';

const token = 'a'.repeat(64);
for (const withIdentity of [false, true]) {
test(`invited artisan applies privately ${withIdentity ? 'with a private ID' : 'without an ID'}`, async ({ page }) => {
  await installMockSupabase(page);
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/artisan_invitation_status', route => route.fulfill({ json: 'available' }));
  await page.route('**/rest/v1/rpc/submit_artisan_application', async route => {
    const body = route.request().postDataJSON(); submissions.push(body);
    await route.fulfill({ json: body.request_id });
  });
  await page.goto(`./artisans/#invite=${token}`);
  const form = page.getByRole('form', { name: 'Artisan application' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Products and techniques you can make')).toHaveAttribute('title', /amigurumi/);
  await expect(form.getByText(/Can you read written crochet patterns/)).toBeVisible();
  await expect(form.getByText(/Which crochet hook sizes do you have/)).toBeVisible();
  await expect(form.getByLabel('Public portfolio link (e.g. Instagram) (optional)')).toBeVisible();
  await form.getByLabel('Full name').fill('Sample Maker');
  await form.getByLabel('Mobile / WhatsApp number').fill('9876543210');
  await form.getByLabel('City / area').fill('Gurugram');
  await form.getByLabel(/^State/).fill('Haryana');
  await form.getByLabel('PIN code').fill('122001');
  await form.getByLabel('Preferred language and contact time').fill('Hindi, evenings');
  await form.getByLabel('Products and techniques you can make').fill('Crochet flowers');
  await form.getByLabel('Weekly availability and approximate capacity').fill('5 hours/week');
  await form.getByLabel('I confirm I am 18 or older.').check();
  await form.getByLabel(/I confirm my details are accurate/).check();
  await form.getByLabel(/I have read and acknowledge the material dispatch/).check();
  if (withIdentity) {
    const buffer = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#dddddd' } }).png().toBuffer();
    await form.getByLabel('Masked ID photo', { exact: false }).setInputFiles({ name: 'synthetic-id.png', mimeType: 'image/png', buffer });
    await form.getByLabel(/I have permanently masked/).check();
  }
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  expect(await page.evaluate(() => ({
    ga: typeof window.gtag, meta: typeof window.fbq,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))).toEqual({ ga: 'undefined', meta: 'undefined', overflow: false });
  await form.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('region', { name: 'Application confirmation' })).toContainText('Your application has been saved');
  expect(submissions).toHaveLength(1);
  const videoLink = page.getByRole('link', { name: 'Share work video on WhatsApp' });
  await expect(videoLink).toBeVisible();
  const videoUrl = new URL((await videoLink.getAttribute('href'))!);
  expect(videoUrl.origin).toBe('https://wa.me');
  expect(videoUrl.searchParams.get('text')).toContain(`Application reference: ${submissions[0].request_id}`);
  expect(videoUrl.href).not.toContain(token);
  await expect(page.getByText(/A video is not required/)).toBeVisible();
  expect(submissions[0]).toMatchObject({ invitation_token: token, privacy_version: '2026-10-29.2',
    dispatch_terms_version: '2026-10-29.1', identity_document: withIdentity
      ? { documentType: 'masked_aadhaar', contentType: 'image/webp', consent: true, data: expect.any(String) } : null,
    application_details: { fullName: 'Sample Maker', paidTrial: false, portfolioUrl: '', adult: true, consent: true } });
  if (withIdentity) {
    const document = submissions[0].identity_document as { data: string };
    const metadata = await sharp(Buffer.from(document.data, 'base64')).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.exif).toBeUndefined();
  }
  await expect(page).toHaveURL(/\/artisans\/$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
}

test('missing and expired invitations never expose an application form', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/artisan_invitation_status', route => route.fulfill({ json: 'unavailable' }));
  await page.goto('./artisans/');
  await expect(page.getByText(/Applications are by invitation/)).toBeVisible();
  await expect(page.getByRole('form', { name: 'Artisan application' })).toHaveCount(0);
  await page.goto(`./artisans/#invite=${token}`);
  await expect(page.getByText(/Applications are by invitation/)).toBeVisible();
  await expect(page.getByRole('form', { name: 'Artisan application' })).toHaveCount(0);
});

test('admin creates email and WhatsApp invitations and reviews an application', async ({ page }) => {
  await installMockSupabase(page);
  const invites: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const application = {
    id: '00000000-0000-4000-8000-000000000001', details: {
      fullName: 'Sample Maker', mobile: '9876543210', city: 'Gurugram', state: 'Haryana', pin: '122001',
      language: 'Hindi', skills: 'Flowers', availability: '5 hours/week', experience: '', tools: '', portfolioUrl: '', notes: '',
      adult: true, consent: true, paidTrial: true,
    }, status: 'New', admin_notes: '', version: 1, created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-10-29.2',
    dispatch_terms_version: '2026-10-29.1', dispatch_terms_accepted_at: '2026-10-29T00:00:00Z',
    identity_type: 'masked_aadhaar', identity_expires_at: '2026-11-28T00:00:00Z',
  };
  await page.route('**/rest/v1/artisan_invitations*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/artisan_application_history*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_artisan_applications', route => route.fulfill({ json: { applications: [application], total: 1 } }));
  await page.route('**/rest/v1/rpc/update_artisan_application', async route => {
    const body = route.request().postDataJSON(); updates.push(body);
    await route.fulfill({ json: { ...application, status: body.next_status, admin_notes: body.review_notes, version: 2 } });
  });
  const identityReads: unknown[] = [];
  const identityRemovals: Record<string, unknown>[] = [];
  const identityImage = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#dddddd' } }).webp().toBuffer();
  await page.route('**/rest/v1/rpc/read_artisan_identity_document', async route => {
    identityReads.push(route.request().postDataJSON());
    await route.fulfill({ json: { contentType: 'image/webp', data: identityImage.toString('base64'), expiresAt: application.identity_expires_at } });
  });
  await page.route('**/rest/v1/rpc/remove_artisan_identity_document', async route => {
    identityRemovals.push(route.request().postDataJSON()); await route.fulfill({ json: application.id });
  });
  await page.route('**/functions/v1/artisan-invitations', async route => {
    const body = route.request().postDataJSON(); invites.push(body);
    await route.fulfill({ json: { link: `https://luviacreations.com/artisans/#invite=${body.token}`,
      message: body.channel === 'email' ? 'Email accepted by provider from onboarding@luviacreations.com' : 'Link created. Send manually.' } });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Artisans', exact: true }).click();
  const form = page.getByRole('form', { name: 'Invite artisan' });
  await form.getByLabel('Artisan name').fill('Sample Maker');
  await form.getByLabel('Artisan email').fill('maker@example.test');
  await form.getByRole('button', { name: 'Send invitation email' }).click();
  await expect(page.getByText('Email accepted by provider from onboarding@luviacreations.com', { exact: true })).toBeVisible();
  expect(invites[0].channel).toBe('email');
  await form.getByLabel('Send using').selectOption('whatsapp');
  await form.getByLabel('Artisan WhatsApp number').fill('9876543210');
  await form.getByRole('button', { name: 'Create WhatsApp invitation' }).click();
  await expect(page.getByRole('link', { name: 'Open WhatsApp to send' })).toHaveAttribute('href', /^https:\/\/wa.me\/919876543210\?text=/);
  expect(invites[1].token).not.toBe(invites[0].token);
  await page.getByRole('button', { name: 'Review Sample Maker' }).click();
  expect(identityReads).toHaveLength(0);
  await page.getByRole('button', { name: 'View private ID' }).click();
  await expect(page.getByAltText('Private artisan identity document')).toBeVisible();
  expect(identityReads).toHaveLength(1);
  await page.getByRole('button', { name: 'Hide ID' }).click();
  await expect(page.getByAltText('Private artisan identity document')).toHaveCount(0);
  await page.getByLabel('Application status').selectOption('Contacted');
  await page.getByLabel('Internal review notes').fill('Paid trial discussion arranged');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Application changes saved.')).toBeVisible();
  expect(updates[0]).toMatchObject({ expected_version: 1, next_status: 'Contacted', review_notes: 'Paid trial discussion arranged' });
  await page.getByRole('button', { name: 'Review Sample Maker' }).click();
  await page.getByRole('button', { name: 'Remove ID after review' }).click();
  expect(identityRemovals).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm ID removal' }).click();
  await expect(page.getByText('Application changes saved.')).toBeVisible();
  expect(identityRemovals[0]).toMatchObject({ application_id: application.id, expected_version: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
