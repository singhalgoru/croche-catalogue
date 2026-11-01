// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildArtisanApplicationEmail, sendArtisanApplicationEmail, type ArtisanApplicationEmailJob } from './artisanApplicationEmail';

const payload = {
  application_id: 'application-123',
  applicant_name: '<Maker>',
  applicant_email: 'maker@example.test',
  mobile: '+919876543210',
  city: 'Gurugram',
  state: 'Haryana',
  skills: 'Flowers & toys',
  availability: '5 hours',
  message: 'Please share a link to your crochet portfolio.',
};
afterEach(() => vi.unstubAllGlobals());

it('sends a concise submission alert to info with a private admin-console review link', async () => {
  const job: ArtisanApplicationEmailJob = { id: 'job-1', kind: 'submitted', recipient_email: 'info@luviacreations.com', payload };
  const email = buildArtisanApplicationEmail(job);
  expect(email.subject).toContain('New artisan application to review');
  expect(email.text).toContain('Please review the private application in the admin console.');
  expect(email.text).toContain('https://luviacreations.com/#admin');
  expect(email.html).toContain('info@luviacreations.com');
  expect(email.html).toContain('href="https://luviacreations.com/#admin"');
  expect(email.html).toContain('&lt;Maker&gt;');
  expect(email.html).not.toContain('Hello <Maker>');
});

it.each([
  ['Trial', 'your paid trial is next', 'Please do not start any work until these details are confirmed'],
  ['Approved', 'Welcome to Luvia Creations', 'not a work agreement'],
  ['Declined', 'An update on your Luvia artisan application', 'unable to proceed'],
  ['More information required', 'More information needed for your Luvia artisan application', 'Please share a link to your crochet portfolio.'],
] as const)('builds applicant-facing %s email without exposing internal notes', (kind, subject, expected) => {
  const applicantPayload = { ...payload, message: 'Please share a link to your crochet portfolio.',
    admin_notes: 'Private internal note' };
  const job: ArtisanApplicationEmailJob = { id: 'job-2', kind, recipient_email: payload.applicant_email,
    payload: applicantPayload };
  const email = buildArtisanApplicationEmail(job);
  expect(email.subject).toContain(subject);
  expect(email.text).toContain(expected);
  expect(email.text).not.toContain('Private internal note');
  expect(email.html).not.toContain('Private internal note');
  expect(email.html).toContain('src="https://luviacreations.com/images/luvia-logo-480.webp"');
  expect(email.html).toContain('width="128"');
  expect(email.html).toContain('CREATE WITH LUVIA');
  expect(email.html.includes('YOU ARE HERE')).toBe(kind === 'Trial');
  expect(email.html).toContain('align="center"');
  expect(email.html).toContain('width="600"');
  expect(email.text).toContain('Onboarding process:');
  expect(email.text).toContain('3. Email update: Receive a decision or a request for more information.');
  expect(email.html).toContain('aria-label="Onboarding process"');
  expect(email.html).toContain('Agree a paid trial');
  expect(email.html).toContain('&darr;');
  expect(email.html).not.toContain('<Maker>');
});

it('welcomes approved artisans to the Luvia family separately from the paid-trial welcome', () => {
  const email = buildArtisanApplicationEmail({ id: 'approved-job', kind: 'Approved',
    recipient_email: payload.applicant_email, payload });
  expect(email.subject).toContain('welcome to the Luvia family!');
  expect(email.html).toContain('Welcome to the Luvia family!');
  expect(email.text).toContain('Your artisan application has been approved.');
  expect(email.text).toContain('What happens next: Our team will contact you');
  expect(email.text).toContain('not a work agreement or a guarantee of ongoing work');
  expect(email.text).not.toContain('invite you to a small paid trial');
  expect(email.html).not.toContain('Details we need from you');
});

it('highlights the exact requested details, preserves separate lines and escapes applicant-facing content', () => {
  const message = '1. Photos of your <crochet> work.\r\n2. Weekly availability.\n\n3. Preferred batch size & timing.';
  const email = buildArtisanApplicationEmail({ id: 'request-job', kind: 'More information required',
    recipient_email: payload.applicant_email, payload: { ...payload, message } });
  expect(email.text).toContain('DETAILS WE NEED FROM YOU:\n1. Photos of your <crochet> work.\n2. Weekly availability.\n\n3. Preferred batch size & timing.');
  expect(email.html).toContain('<h2 style="margin:0 0 12px;color:#604239;font-size:20px;line-height:1.4">Details we need from you</h2>');
  expect(email.html).toContain('font-weight:bold;line-height:1.65;overflow-wrap:anywhere">1. Photos of your &lt;crochet&gt; work.<br>2. Weekly availability.<br><br>3. Preferred batch size &amp; timing.');
  expect(email.html).toContain('Reply to this email with an answer to each requested detail above.');
  expect(email.html).toContain('Do not send identity documents, bank details, passwords or OTPs.');
  expect(email.html).not.toContain('<crochet>');
  expect(email.html.indexOf('Details we need from you')).toBeLessThan(email.html.indexOf('aria-label="Onboarding process"'));
});

it('sends notifications from onboarding with a stable idempotency key and correct reply target', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const job: ArtisanApplicationEmailJob = { id: 'job-3', kind: 'Approved', recipient_email: payload.applicant_email, payload };
  expect(await sendArtisanApplicationEmail(job, 'fixture')).toBe('provider-id');
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers['Idempotency-Key']).toBe('artisan-application-job-3');
  const body = JSON.parse(options.body);
  expect(body.from).toBe('Luvia Creations <onboarding@luviacreations.com>');
  expect(body.to).toEqual(['maker@example.test']);
  expect(body.reply_to).toBe('info@luviacreations.com');
  expect(body.subject).toContain('Welcome');
});

it('validates recipients and reports provider refusal or malformed acceptance', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const job: ArtisanApplicationEmailJob = { id: 'job-4', kind: 'submitted', recipient_email: 'bad',
    payload: { ...payload, applicant_email: 'bad' } };
  await expect(sendArtisanApplicationEmail(job, 'fixture')).rejects.toThrow('Invalid artisan email');
  expect(fetch).not.toHaveBeenCalled();
  job.recipient_email = 'info@luviacreations.com';
  fetch.mockResolvedValue(new Response('{}', { status: 429 }));
  await expect(sendArtisanApplicationEmail(job, 'fixture')).rejects.toThrow('HTTP 429');
  fetch.mockResolvedValue(new Response('{}'));
  await expect(sendArtisanApplicationEmail(job, 'fixture')).rejects.toThrow('Invalid artisan email provider confirmation');
});
