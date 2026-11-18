// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, from, sendPattern, sendApplication } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), sendPattern: vi.fn(), sendApplication: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('../_shared/productPatternEmail.ts', async original => ({
  ...await original<typeof import('../_shared/productPatternEmail')>(), sendProductPatternEmail: sendPattern,
}));
vi.mock('../_shared/artisanApplicationEmail.ts', () => ({ sendArtisanApplicationEmail: sendApplication }));
let handle: (request: Request) => Promise<Response>;
let env: Record<string, string>;
let persistenceFailed: boolean;
const updates: { table: string; value: Record<string, unknown> }[] = [];
const job = { id: '00000000-0000-4000-8000-000000000001', recipient_name: 'Maker', recipient_email: 'maker@example.test',
  product_name: 'Lotus', filename: 'Lotus.pdf', message: '', language: 'en',
  data: Buffer.from('%PDF-1.7\n' + 'x'.repeat(100)).toString('base64') };
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] },
    serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); updates.length = 0; persistenceFailed = false;
  env = { CUSTOMER_WELCOME_WORKER_SECRET: 'test-secret', RESEND_API_KEY: 'test-key',
    SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service' };
  rpc.mockImplementation(async (name: string) => ({ data: name === 'claim_product_pattern_emails' ? [job] : [] }));
  sendPattern.mockResolvedValue('provider-id');
  from.mockImplementation((table: string) => ({ update: (value: Record<string, unknown>) => {
    updates.push({ table, value });
    const result = () => Promise.resolve(persistenceFailed
      ? { error: { message: 'Save failed' } } : { data: { id: job.id } });
    return { eq: () => Object.assign(result(), { select: () => ({ single: result }) }) };
  } }));
});
const request = (secret = 'test-secret') => new Request('https://example.test/worker',
  { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
it('does not claim private patterns without the worker secret or email configuration', async () => {
  expect((await handle(request('wrong'))).status).toBe(401);
  env.RESEND_API_KEY = '';
  expect((await handle(request())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
it('processes the new queue and saves provider acceptance while dropping duplicate attachment bytes', async () => {
  expect(await (await handle(request())).json()).toEqual({ accepted: 1, failed: 0 });
  expect(sendPattern).toHaveBeenCalledWith(job, 'test-key');
  expect(updates).toEqual([{ table: 'product_pattern_emails', value: {
    provider_id: 'provider-id', accepted_at: expect.any(String), last_error: null, content: null,
  } }]);
});
it('keeps failure explicit and retryable when provider acceptance cannot be persisted', async () => {
  persistenceFailed = true;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ accepted: 0, failed: 1 });
  expect(updates[1]!.value.last_error).toContain('same provider idempotency key');
  log.mockRestore();
});
it('refuses malformed jobs without sending and reports claim failures', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockImplementation(async name => ({ data: name === 'claim_product_pattern_emails' ? [{ ...job, filename: 'macro.docm' }] : [] }));
  expect((await handle(request())).status).toBe(502);
  expect(sendPattern).not.toHaveBeenCalled();
  rpc.mockImplementation(async name => name === 'claim_product_pattern_emails'
    ? { error: { message: 'Unavailable' } } : { data: [] });
  expect((await handle(request())).status).toBe(500);
  log.mockRestore();
});
it('preserves application-update processing alongside pattern attachments', async () => {
  const application = { id: job.id, kind: 'Approved', recipient_email: job.recipient_email,
    payload: { application_id: job.id, applicant_name: 'Maker', applicant_email: job.recipient_email,
      mobile: '9876543210', city: 'Test city', state: 'Test state', skills: 'Flowers', availability: '5 hours', message: '' } };
  rpc.mockImplementation(async name => ({ data: name === 'claim_product_pattern_emails' ? [job] : [application] }));
  sendApplication.mockResolvedValue('application-provider');
  expect(await (await handle(request())).json()).toEqual({ accepted: 2, failed: 0 });
  expect(sendApplication).toHaveBeenCalledWith(application, 'test-key');
  expect(sendPattern).toHaveBeenCalledWith(job, 'test-key');
});
