// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildArtisanWorkEmail, isWorkEmailJob, sendArtisanWorkEmail, WORK_QUALITY_TERMS, workPaymentSummary, type WorkEmailJob } from './artisanWorkEmail';

const job: WorkEmailJob = { id: '00000000-0000-4000-8000-000000000001', kind: 'offer', token: 'a'.repeat(64),
  recipientEmail: 'maker@example.test', acceptedAt: null,
  offer: { reference: '00000000-0000-4000-8000-000000000001', recipientName: '<Maker>', subject: 'Work assignment',
    message: '<script>hello</script>', deliveryDate: '2099-12-01', courierCap: 120,
    items: [{ name: 'Hat & bag', quantity: 2, rateWithYarn: 150, rateWithoutYarn: 100, patternFilename: 'hat.pdf' }] },
  attachments: [{ filename: 'hat.pdf', content: Buffer.from('%PDF-1.7 pattern').toString('base64') }] };
afterEach(() => vi.unstubAllGlobals());
it('renders the same branded, escaped terms used for preview and sending', () => {
  const email = buildArtisanWorkEmail(job.offer, 'https://example.test/#work=token');
  expect(email.html).toContain('luvia-pattern-logo.jpg');
  expect(email.html).toContain('&lt;script&gt;hello&lt;/script&gt;');
  expect(email.html).not.toContain('<script>');
  expect(email.text).toContain('including yarn INR 150.00/unit');
  expect(email.text).toContain('Maximum courier reimbursement: INR 120.00');
  expect(email.text).toContain('Anyone with the link can accept');
  expect(isWorkEmailJob(job)).toBe(true);
  expect(isWorkEmailJob({ ...job, token: 'bad' })).toBe(false);
  expect(isWorkEmailJob({ ...job, attachments: [{ filename: 'bad.exe', content: 'abc' }] })).toBe(false);
});
it('shows selected-rate totals, rounded advance and quality terms without reference IDs', () => {
  const offer = { ...job.offer, advancePercent: 25, qualityTerms: WORK_QUALITY_TERMS,
    items: [{ ...job.offer.items[0]!, yarnBasis: 'without' as const },
      { name: 'Flower', quantity: 3, rateWithYarn: 0.01, rateWithoutYarn: 0.02, yarnBasis: 'with' as const, patternFilename: null }] };
  const email = buildArtisanWorkEmail(offer, 'https://example.test');
  expect(workPaymentSummary(offer)).toEqual({ total: 'INR 200.03', advance: 'INR 50.01', balance: 'INR 150.02' });
  for (const body of [email.html, email.text]) {
    expect(body).toContain('INR 200.03');
    expect(body).toContain('INR 50.01');
    expect(body).toContain('INR 150.02');
    expect(body).toContain(WORK_QUALITY_TERMS);
    expect(body).not.toContain(offer.reference);
  }
  expect(isWorkEmailJob({ ...job, offer })).toBe(true);
  expect(isWorkEmailJob({ ...job, offer: { ...offer, advancePercent: 28.99 } })).toBe(true);
  expect(isWorkEmailJob({ ...job, offer: { ...offer, advancePercent: 100.01 } })).toBe(false);
  expect(isWorkEmailJob({ ...job, offer: { ...offer, items: job.offer.items } })).toBe(false);
  expect(workPaymentSummary({ ...offer, advancePercent: 0 })?.balance).toBe('INR 200.03');
  expect(workPaymentSummary({ ...offer, advancePercent: 100 })?.balance).toBe('INR 0.00');
  expect(workPaymentSummary(job.offer)).toBeNull();
});
it('sends the PDF offer to the artisan and a separate idempotent confirmation to info', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: 'provider-id' })));
  vi.stubGlobal('fetch', fetcher);
  await sendArtisanWorkEmail(job, 'test-key');
  const offer = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(offer.to).toEqual(['maker@example.test']);
  expect(offer.attachments[0].filename).toBe('hat.pdf');
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toContain(`offer-${job.id}`);
  await sendArtisanWorkEmail({ ...job, kind: 'acceptance', token: null, acceptedAt: '2026-01-01T00:00:00Z', attachments: [] }, 'test-key');
  const confirmation = JSON.parse(fetcher.mock.calls[1]![1].body);
  expect(confirmation.to).toEqual(['info@luviacreations.com']);
  expect(confirmation.text).toContain('accepted the work assignment');
  expect(fetcher.mock.calls[1]![1].headers['Idempotency-Key']).toContain(`acceptance-${job.id}`);
});
