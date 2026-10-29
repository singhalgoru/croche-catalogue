import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const token = 'a'.repeat(64);
test('invited artisan applies privately without tracking or mobile overflow', async ({ page }) => {
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
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  expect(await page.evaluate(() => ({
    ga: typeof window.gtag, meta: typeof window.fbq,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))).toEqual({ ga: 'undefined', meta: 'undefined', overflow: false });
  await form.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('region', { name: 'Application confirmation' })).toContainText('Your application has been saved');
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ invitation_token: token, privacy_version: '2026-10-29',
    application_details: { fullName: 'Sample Maker', paidTrial: false, portfolioUrl: '', adult: true, consent: true } });
  await expect(page).toHaveURL(/\/artisans\/$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

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
    updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-10-29',
  };
  await page.route('**/rest/v1/artisan_invitations*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/artisan_application_history*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_artisan_applications', route => route.fulfill({ json: { applications: [application], total: 1 } }));
  await page.route('**/rest/v1/rpc/update_artisan_application', async route => {
    const body = route.request().postDataJSON(); updates.push(body);
    await route.fulfill({ json: { ...application, status: body.next_status, admin_notes: body.review_notes, version: 2 } });
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
  await page.getByLabel('Application status').selectOption('Contacted');
  await page.getByLabel('Internal review notes').fill('Paid trial discussion arranged');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Application changes saved.')).toBeVisible();
  expect(updates[0]).toMatchObject({ expected_version: 1, next_status: 'Contacted', review_notes: 'Paid trial discussion arranged' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
