// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildProductPatternEmail, isProductPatternEmailJob, sendProductPatternEmail } from './productPatternEmail';

const job = { id: '00000000-0000-4000-8000-000000000001', recipient_name: '<Maker>', recipient_email: 'maker@example.test',
  product_name: 'Lotus & flower', filename: 'Lotus.pdf', message: '<script>private notes</script>', language: 'hi' as const,
  data: Buffer.from('%PDF-1.7\n' + 'x'.repeat(100)).toString('base64') };
afterEach(() => vi.unstubAllGlobals());
it('builds a branded private pattern email without interpreting artisan names or messages as HTML', () => {
  const email = buildProductPatternEmail(job);
  expect(email.html).toContain('luvia-pattern-logo.jpg');
  expect(email.html).toContain('&lt;Maker&gt;');
  expect(email.html).toContain('&lt;script&gt;');
  expect(email.html).not.toContain('<script>');
  expect(email.text).toContain('not a work order');
  expect(email.text).toContain('Lotus.pdf');
  expect(email.text).not.toContain('editable Word');
  expect(isProductPatternEmailJob(job)).toBe(true);
  expect(isProductPatternEmailJob({ ...job, filename: 'macro.docm' })).toBe(false);
  expect(isProductPatternEmailJob({ ...job, data: 'not a document' })).toBe(false);
  expect(isProductPatternEmailJob({ ...job, recipient_email: 'invalid' })).toBe(false);
});
it('sends the exact PDF bytes as an attachment to one recipient with provider idempotency', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-id' })));
  vi.stubGlobal('fetch', fetcher);
  expect(await sendProductPatternEmail(job, 'test-key')).toBe('provider-id');
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(`product-pattern-${job.id}`);
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.to).toEqual(['maker@example.test']);
  expect(body.attachments).toEqual([{ filename: 'Lotus.pdf', content: job.data,
    content_type: 'application/pdf' }]);
  expect(body.reply_to).toBe('hello@luviacreations.com');
});
it('surfaces provider failures and malformed acceptance rather than claiming delivery', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValueOnce(new Response('{}')).mockRejectedValueOnce(new Error('Network failed'));
  vi.stubGlobal('fetch', fetcher);
  await expect(sendProductPatternEmail(job, 'test-key')).rejects.toThrow('HTTP 429');
  await expect(sendProductPatternEmail(job, 'test-key')).rejects.toThrow('could not be confirmed');
  await expect(sendProductPatternEmail(job, 'test-key')).rejects.toThrow('Network failed');
});
