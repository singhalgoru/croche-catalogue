import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { goToAdminSection } from './adminNavigation';
import { installMockSupabase } from './mockSupabase';

const token = 'a'.repeat(64);
test('artisan explicitly accepts a work assignment without accepting on link open', async ({ page }) => {
  await installMockSupabase(page);
  const calls: unknown[] = [];
  const offer = { reference: '00000000-0000-4000-8000-000000000001', recipientName: 'Sample Maker',
    subject: 'Work offer', message: 'Please review these terms.', deliveryDate: '2099-12-01', courierCap: 100,
    items: [{ name: 'Headband', quantity: 2, rateWithYarn: 150, rateWithoutYarn: 100, patternFilename: 'Headband.pdf' }] };
  await page.route('**/rest/v1/rpc/read_artisan_work_assignment', route =>
    route.fulfill({ json: { offer, acceptedAt: null, completedAt: null, expiresAt: '2099-12-01T00:00:00Z' } }));
  await page.route('**/rest/v1/rpc/accept_artisan_work_assignment', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: true });
  });
  await page.goto(`./artisans/#work=${token}`);
  await expect(page.getByText('Headband', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('checkbox', { name: /I accept these work assignment terms/ }).check();
  await page.getByRole('button', { name: 'Accept assignment' }).click();
  await expect(page.getByText(/Work is in progress/)).toBeVisible();
  expect(calls).toEqual([{ token }]);
  expect(await page.evaluate(() => ({ ga: typeof window.gtag, meta: typeof window.fbq })))
    .toEqual({ ga: 'undefined', meta: 'undefined' });
});
test('admin previews an assignment and completes accepted work', async ({ page }) => {
  await installMockSupabase(page);
  const application = { id: '00000000-0000-4000-8000-000000000001',
    details: { fullName: 'Sample Maker', mobile: '9876543210', city: 'Gurugram', state: 'Haryana', pin: '122001',
      language: 'Hindi', skills: 'Flowers', availability: '5 hours/week', experience: '', tools: '', portfolioUrl: '', notes: '',
      adult: true, consent: true, paidTrial: true },
    contact_email: 'maker@example.test', status: 'Approved', admin_notes: '', version: 1,
    created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-11-01.1' };
  const entries: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/artisan_invitations*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/list_artisan_applications', route =>
    route.fulfill({ json: { applications: [application], total: 1 } }));
  await page.route('**/rest/v1/rpc/list_artisan_work_assignments', route => route.fulfill({ json: entries }));
  await page.route('**/rest/v1/rpc/create_artisan_work_assignment', route => {
    const body = route.request().postDataJSON();
    const draft = body.draft;
    entries.push({ id: body.request_id, offer: { reference: body.request_id, recipientName: 'Sample Maker',
      subject: draft.subject, message: draft.message, deliveryDate: draft.deliveryDate, courierCap: draft.courierCap,
      items: draft.items.map((item: { name: string; quantity: number; rateWithYarn: number; rateWithoutYarn: number }) => ({
        ...item, patternFilename: null })) }, createdAt: '2026-11-22T00:00:00Z', expiresAt: '2099-12-01T00:00:00Z',
    acceptedAt: '2026-11-22T01:00:00Z', completedAt: null, offerSentAt: '2026-11-22T00:10:00Z',
    offerError: null, offerAttempts: 1, confirmationSentAt: null, confirmationError: null, confirmationAttempts: 0 });
    return route.fulfill({ json: body.request_id });
  });
  await page.route('**/rest/v1/rpc/complete_artisan_work_assignment', route => {
    entries[0]!.completedAt = '2026-11-22T02:00:00Z';
    return route.fulfill({ json: true });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await goToAdminSection(page, 'Artisans');
  await page.getByRole('button', { name: 'Assign Work' }).click();
  const modal = page.getByRole('dialog', { name: 'Assign work - Sample Maker' });
  await modal.getByLabel('Product name').fill('Custom flower');
  await modal.getByLabel('Quantity').fill('2');
  await modal.getByLabel('Including yarn / unit (INR)').fill('150');
  await modal.getByLabel('Excluding yarn / unit (INR)').fill('100');
  await modal.getByLabel('Delivery date').fill('2099-12-01');
  await modal.getByLabel('Maximum courier reimbursement (INR)').fill('80');
  await modal.getByRole('button', { name: 'Preview email' }).click();
  await expect(modal.getByTitle('Assignment email preview')).toBeVisible();
  await modal.getByRole('button', { name: 'Send assignment email' }).click();
  await expect(modal.getByText('Work in progress')).toBeVisible();
  await modal.getByRole('button', { name: 'Mark work complete' }).click();
  await modal.getByRole('button', { name: 'Confirm completion' }).click();
  await expect(modal.getByText('Completed', { exact: true })).toBeVisible();
});
test('artisan privately submits payment details before Trial',async ({ page }) => {
  await installMockSupabase(page);
  const submissions: unknown[] = [];
  await page.route('**/rest/v1/rpc/submit_artisan_payment_details',async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: true });
  });
  await page.goto(`./artisans/#payment=${token}`);
  await expect(page.getByRole('heading',{ name: 'Payment details for your paid trial' })).toBeVisible();
  await page.getByLabel('Account holder name').fill('Sample Maker');
  await page.getByLabel('UPI ID').fill('maker@bank');
  await page.getByRole('checkbox',{ name: /These payment details are in my own name/ }).check();
  await page.getByRole('button',{ name: 'Submit payment details' }).click();
  await expect(page.getByText(/Payment details submitted for review/)).toBeVisible();
  expect(submissions).toEqual([{ token,details: { name: 'Sample Maker',method: 'UPI',upi: 'maker@bank' },consent: true }]);
  await expect(page).toHaveURL(/\/artisans\/$/);
  expect(await page.evaluate(() => ({ ga: typeof window.gtag, meta: typeof window.fbq,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })))
    .toEqual({ ga: 'undefined',meta: 'undefined',overflow: false });
});
for (const { withIdentity, nativeWebp, scalarEncoder = false } of [
  { withIdentity: false, nativeWebp: true },
  { withIdentity: true, nativeWebp: true },
  { withIdentity: true, nativeWebp: false },
  { withIdentity: true, nativeWebp: false, scalarEncoder: true },
]) {
test(`invited artisan applies privately ${withIdentity ? 'with a private ID' : 'without an ID'}${nativeWebp ? '' : ' without native WebP encoding'}${scalarEncoder ? ' or WASM SIMD' : ''}`, async ({ page }) => {
  if (!nativeWebp) await page.addInitScript(() => {
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      return nativeToBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality);
    };
  });
  if (scalarEncoder) await page.addInitScript(() => {
    WebAssembly.validate = () => false;
  });
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
  await expect(page.getByRole('heading', { name: 'How the onboarding process works' })).toBeVisible();
  await expect(form.getByLabel('Products and techniques you can make')).toHaveAttribute('title', /amigurumi/);
  await expect(form.getByText(/Can you read written crochet patterns/)).toBeVisible();
  await expect(form.getByText(/Which crochet hook sizes do you have/)).toBeVisible();
  await expect(form.getByLabel('Public portfolio link (e.g. Instagram) (optional)')).toBeVisible();
  await form.getByLabel('Full name').fill('Sample Maker');
  await form.getByLabel('Email for application updates').fill('maker@example.test');
  await form.getByLabel('Mobile / WhatsApp number').fill('9876543210');
  await expect(form.getByLabel('Delivery address')).toHaveAttribute('required', '');
  await form.getByLabel('Delivery address').fill('Synthetic delivery address');
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
    await form.getByLabel(/^Profile photo \(/).setInputFiles({ name: 'synthetic-portrait.png', mimeType: 'image/png', buffer });
    await form.getByLabel(/I consent to private database storage of my profile photo/).check();
  }
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  expect(await page.evaluate(() => ({
    ga: typeof window.gtag, meta: typeof window.fbq,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))).toEqual({ ga: 'undefined', meta: 'undefined', overflow: false });
  await form.getByLabel('Delivery address').fill('');
  await form.getByRole('button', { name: 'Submit application' }).click();
  expect(await form.getByLabel('Delivery address').evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  expect(submissions).toHaveLength(0);
  await form.getByLabel('Delivery address').fill('Synthetic delivery address');
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
  expect(submissions[0]).toMatchObject({ invitation_token: token, applicant_email: 'maker@example.test', privacy_version: '2026-11-01.1',
    dispatch_terms_version: '2026-10-29.1', identity_document: withIdentity
      ? { documentType: 'masked_aadhaar', contentType: 'image/webp', consent: true, data: expect.any(String) } : null,
    profile_photo: withIdentity ? { contentType: 'image/webp', consent: true, consentVersion: '2026-10-30.1', data: expect.any(String) } : null,
    application_details: { fullName: 'Sample Maker', address: 'Synthetic delivery address', paidTrial: false, portfolioUrl: '', adult: true, consent: true } });
  expect(submissions[0].application_details).not.toHaveProperty('email');
  if (withIdentity) {
    const document = submissions[0].identity_document as { data: string };
    const metadata = await sharp(Buffer.from(document.data, 'base64')).metadata();
    expect(metadata.format).toBe('webp'); expect(metadata.exif).toBeUndefined();
    const portrait = submissions[0].profile_photo as { data: string };
    const photoMetadata = await sharp(Buffer.from(portrait.data, 'base64')).metadata();
    expect(photoMetadata.format).toBe('webp'); expect(photoMetadata.exif).toBeUndefined();
  }
  await expect(page).toHaveURL(/\/artisans\/$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
}

test('Hindi form preserves original answers across language switches and submission', async ({ page }) => {
  await installMockSupabase(page);
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/artisan_invitation_status', route => route.fulfill({ json: 'available' }));
  await page.route('**/rest/v1/rpc/submit_artisan_application', async route => {
    const body = route.request().postDataJSON(); submissions.push(body);
    await route.fulfill({ json: body.request_id });
  });
  await page.goto(`./artisans/#invite=${token}`);
  await expect(page.getByRole('form', { name: 'Artisan application' })).toBeVisible();
  await page.getByLabel('Form language / फॉर्म की भाषा').selectOption('hi');
  const form = page.getByRole('form', { name: 'कारीगर आवेदन' });
  await form.getByLabel('पूरा नाम').fill('परीक्षण कारीगर');
  await form.getByLabel('आवेदन अपडेट के लिए ईमेल').fill('maker@example.test');
  await form.getByLabel('मोबाइल / WhatsApp नंबर').fill('9876543210');
  await expect(form.getByLabel('डिलीवरी का पता')).toHaveAttribute('required', '');
  await form.getByLabel('डिलीवरी का पता').fill('परीक्षण गली');
  await form.getByLabel('शहर / क्षेत्र').fill('गुरुग्राम');
  await form.getByLabel('राज्य', { exact: false }).fill('हरियाणा');
  await form.getByLabel('पिन कोड').fill('122001');
  await form.getByLabel('पसंदीदा भाषा और संपर्क का समय').fill('हिन्दी, शाम को');
  await form.getByLabel('आप कौन-से उत्पाद और तकनीक बना सकते हैं').fill('फूल और अमिगुरुमी खिलौने');
  await form.getByLabel('हर सप्ताह उपलब्ध समय और अनुमानित काम की क्षमता').fill('हर सप्ताह 5 घंटे');
  await page.getByLabel('Form language / फॉर्म की भाषा').selectOption('en');
  await expect(page.getByLabel('Full name')).toHaveValue('परीक्षण कारीगर');
  await page.getByLabel('Form language / फॉर्म की भाषा').selectOption('hi');
  await form.getByLabel(/मेरी आयु 18 वर्ष/).check();
  await form.getByLabel(/जानकारी सही है/).check();
  await form.getByLabel(/मैंने सामग्री भेजने/).check();
  await expect(form.getByRole('heading', { name: 'आवेदन गोपनीयता सूचना' })).toBeVisible();
  await form.getByRole('button', { name: 'आवेदन जमा करें' }).click();
  await expect(page.getByRole('region', { name: 'आवेदन की पुष्टि' })).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ application_details: { fullName: 'परीक्षण कारीगर', address: 'परीक्षण गली',
    city: 'गुरुग्राम', state: 'हरियाणा', language: 'हिन्दी, शाम को', skills: 'फूल और अमिगुरुमी खिलौने',
    availability: 'हर सप्ताह 5 घंटे' }, applicant_email: 'maker@example.test', privacy_version: '2026-11-01.1' });
  await expect(page.getByRole('link', { name: 'WhatsApp पर काम का वीडियो साझा करें' })).toBeVisible();
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
    }, contact_email: 'maker@example.test', status: 'New', admin_notes: '', applicant_message: '', version: 1, created_at: '2026-10-29T00:00:00Z',
    updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-11-01.1',
    dispatch_terms_version: '2026-10-29.1', dispatch_terms_accepted_at: '2026-10-29T00:00:00Z',
    identity_type: 'masked_aadhaar', identity_expires_at: '2026-11-28T00:00:00Z',
    delivery_address: 'Synthetic delivery address', skill_rating: null as number | null, capabilities: '', has_profile_photo: true,
  };
  await page.route('**/rest/v1/artisan_invitations*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/artisan_application_history*', route => route.fulfill({ json: [] }));
  const filters: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/list_artisan_applications', async route => {
    const body = route.request().postDataJSON(); filters.push(body);
    const matches = (!body.minimum_rating || (application.skill_rating ?? 0) >= body.minimum_rating)
      && (!body.skill_filter || `${application.details.skills} ${application.capabilities}`.toLowerCase().includes(body.skill_filter.toLowerCase()));
    await route.fulfill({ json: { applications: matches ? [application] : [], total: matches ? 1 : 0 } });
  });
  await page.route('**/rest/v1/rpc/update_artisan_application', async route => {
    const body = route.request().postDataJSON(); updates.push(body);
    Object.assign(application, { status: body.next_status, admin_notes: body.review_notes, applicant_message: body.applicant_message, version: application.version + 1 });
    await route.fulfill({ json: application });
  });
  const comments: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/artisan_activity', route => route.fulfill({ json: { comments, payments } }));
  await page.route('**/rest/v1/rpc/save_artisan_skills', async route => {
    const body = route.request().postDataJSON();
    expect(body.expected_version).toBe(application.version);
    Object.assign(application, { skill_rating: body.rating, capabilities: body.can_create, version: application.version + 1 });
    await route.fulfill({ json: application });
  });
  await page.route('**/rest/v1/rpc/add_artisan_comment', async route => {
    const body = route.request().postDataJSON();
    comments.push({ id: body.request_id, body: body.comment_body, created_at: '2026-10-30T00:00:00Z' });
    await route.fulfill({ json: body.request_id });
  });
  await page.route('**/rest/v1/rpc/record_artisan_payment', async route => {
    const body = route.request().postDataJSON();
    payments.push({ id: body.request_id, paid_on: body.payment_date, amount: body.payment_amount, method: body.payment_method,
      reference: body.payment_reference, description: body.payment_description, created_at: '2026-10-30T00:00:00Z', voided_at: null, void_reason: null });
    await route.fulfill({ json: body.request_id });
  });
  await page.route('**/rest/v1/rpc/void_artisan_payment', async route => {
    const body = route.request().postDataJSON();
    const payment = payments.find(entry => entry.id === body.payment_id)!;
    payment.voided_at = '2026-10-30T00:00:00Z'; payment.void_reason = body.reason;
    await route.fulfill({ json: body.payment_id });
  });
  const identityReads: unknown[] = [];
  const identityRemovals: Record<string, unknown>[] = [];
  const identityImage = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#dddddd' } }).webp().toBuffer();
  await page.route('**/rest/v1/rpc/read_artisan_profile_photo', route => route.fulfill({
    json: { contentType: 'image/webp', data: identityImage.toString('base64') },
  }));
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
  await goToAdminSection(page, 'Artisans');
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
  await expect(page.getByText('Synthetic delivery address', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Can create / assessed skills')).not.toBeVisible();
  await page.locator('summary').filter({ hasText: /^Working profile$/ }).click();
  await expect(page.getByLabel('Can create / assessed skills')).toHaveValue('Flowers');
  await page.getByRole('button', { name: 'View profile photo' }).click();
  await expect(page.getByAltText('Private profile of Sample Maker')).toBeVisible();
  await page.getByLabel('Skill rating', { exact: true }).selectOption('4');
  await page.getByLabel('Can create / assessed skills').fill('Amigurumi toys and flowers');
  await page.getByRole('button', { name: 'Save skills and rating' }).click();
  await expect(page.getByText('Skills and rating saved.', { exact: true })).toBeVisible();
  await page.getByLabel('New internal comment').fill('Paid trial stitches reviewed');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByText('Paid trial stitches reviewed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to applications' }).click();
  await page.getByRole('button', { name: 'Payments for Sample Maker' }).click();
  await expect(page.getByRole('dialog', { name: 'Payments for Sample Maker' })).toBeVisible();
  await page.getByLabel('Amount paid (INR)').fill('125.50');
  await page.getByLabel('Transaction reference (optional for cash)').fill('synthetic-payment');
  await page.getByLabel('Work / batch description').fill('Paid trial flowers');
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(page.getByText('Payment recorded. No money was sent by this site.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Total paid \(excluding voided entries\)/)).toContainText('125.50');
  await page.getByRole('button', { name: /^Void payment/ }).click();
  await page.getByLabel('Reason for voiding').fill('Wrong batch reference');
  await page.getByRole('button', { name: 'Confirm void payment', exact: true }).click();
  await expect(page.getByText('Payment voided; original entry retained.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Total paid \(excluding voided entries\)/)).toContainText('0.00');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download payments CSV', exact: true }).click();
  expect((await csvDownload).suggestedFilename()).toBe('luvia-artisan-payments.csv');
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download payments CSV template' }).click();
  const template = await templateDownload;
  expect(template.suggestedFilename()).toBe('luvia-artisan-payments-template.csv');
  const templatePath = await template.path();
  if (!templatePath) throw new Error('Payment template download is unavailable.');
  const csv = [
    readFileSync(templatePath, 'utf8').split(/\r?\n/)[0],
    ',2025-03-30,100,Cash,,Flower batch,Recorded',
    ',2025-03-31,125.50,UPI,txn-2,Coaster batch,Recorded',
  ].join('\n');
  await page.getByLabel('Upload payments CSV').setInputFiles({ name: 'payments.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Imported 2 new payments for this artisan. No money was sent.')).toBeVisible();
  await expect(page.getByText(/Total paid \(excluding voided entries\)/)).toContainText('225.50');
  expect(payments).toHaveLength(3);
  await page.getByRole('button', { name: 'Close Payments for Sample Maker' }).click();
  const allDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all payments CSV' }).click();
  const allCsv = await allDownload;
  expect(allCsv.suggestedFilename()).toBe('luvia-all-artisan-payments.csv');
  const allPath = await allCsv.path();
  if (!allPath) throw new Error('All payments download is unavailable.');
  expect(readFileSync(allPath, 'utf8')).toContain(`Sample Maker [${application.id}]`);
  const workbookDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all payments template' }).click();
  const workbookFile = await workbookDownload;
  expect(workbookFile.suggestedFilename()).toBe('luvia-all-artisan-payments-template.xlsx');
  const workbookPath = await workbookFile.path();
  if (!workbookPath) throw new Error('All payments template download is unavailable.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet('Payments')!;
  expect(sheet.getCell('A2').dataValidation).toMatchObject({ type: 'list', formulae: ['ArtisanChoices'] });
  sheet.getRow(2).values = [`Sample Maker [${application.id}]`, '', '2025-03-29', 50, 'Cash', '', 'Bulk batch', 'Recorded', ''];
  const bulkCsv = await workbook.csv.writeBuffer({ sheetName: 'Payments' });
  await page.getByLabel('Upload all payments CSV').setInputFiles({ name: 'all-payments.csv', mimeType: 'text/csv', buffer: Buffer.from(bulkCsv) });
  await expect(page.getByText('Imported 1 new payment across artisans. No money was sent.')).toBeVisible();
  expect(payments).toHaveLength(4);
  await page.getByRole('button', { name: 'Review Sample Maker' }).click();
  expect(identityReads).toHaveLength(0);
  await page.getByRole('button', { name: 'View private ID' }).click();
  await expect(page.getByAltText('Private artisan identity document')).toBeVisible();
  expect(identityReads).toHaveLength(1);
  await page.getByRole('button', { name: 'Hide ID' }).click();
  await expect(page.getByAltText('Private artisan identity document')).toHaveCount(0);
  await page.getByLabel('Application status').selectOption('More information required');
  await page.getByLabel('Internal review notes').fill('Paid trial discussion arranged');
  await page.getByLabel('Message to artisan (sent by email; not an internal note)').fill('Please share a link to your crochet portfolio.');
  await page.getByRole('button', { name: 'Save review' }).click();
  const emailNotice = page.getByRole('dialog', { name: 'Email notification' });
  await expect(emailNotice).toContainText('More information required email was queued');
  await emailNotice.getByRole('button', { name: 'Close Email notification' }).click();
  await expect(page.getByText('Application changes saved.')).toBeVisible();
  expect(updates[0]).toMatchObject({ expected_version: 2, next_status: 'More information required',
    review_notes: 'Paid trial discussion arranged', applicant_message: 'Please share a link to your crochet portfolio.' });
  await page.getByLabel('Skill / can create', { exact: true }).fill('amigurumi');
  await page.getByRole('button', { name: 'Search / refresh' }).click();
  await page.getByLabel('Minimum skill rating').selectOption('4');
  await expect(page.getByRole('button', { name: 'Review Sample Maker' })).toBeVisible();
  expect(filters.some(filter => filter.skill_filter === 'amigurumi' && filter.minimum_rating === 4)).toBe(true);
  await page.getByRole('button', { name: 'Review Sample Maker' }).click();
  await page.getByRole('button', { name: 'Remove ID after review' }).click();
  expect(identityRemovals).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm ID removal' }).click();
  await expect(page.getByText('Application changes saved.')).toBeVisible();
  expect(identityRemovals[0]).toMatchObject({ application_id: application.id, expected_version: 3 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
