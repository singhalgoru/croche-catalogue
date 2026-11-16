// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc }),
}));

const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-fixture',
  GEMINI_API_KEY: 'gemini-fixture',
};
let handle: (request: Request) => Promise<Response>;
const fetcher = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (handler: typeof handle) => { handle = handler; },
  });
  vi.stubGlobal('fetch', fetcher);
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());

const brief = {
  productOrOffer: 'Handmade crochet flowers',
  goal: 'sales',
  landingPageUrl: 'https://luviacreations.com/products/flowers',
  targetLocation: 'Mumbai',
  dailyBudgetInr: 500,
  durationDays: 7,
};
const request = (body: unknown = brief) => new Request('https://example.test/marketing-draft', {
  method: 'POST',
  headers: { Authorization: 'Bearer user-session', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const copy = {
  campaignName: 'Handmade crochet flowers',
  audienceSummary: 'Broad audience in Mumbai.',
  creativeDirection: 'Show the crochet flowers in a bright, simple setting.',
  primaryText: ['A handmade crochet flower for your space.', 'Discover crochet flowers made by hand.'],
  headlines: ['Handmade crochet flowers', 'A thoughtful handmade gift'],
  description: 'Explore handmade crochet flowers.',
  callToAction: 'Shop now',
  assumptions: ['Confirm current product availability.', 'Confirm the landing page is correct.'],
};
const providerResponse = (value: unknown) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  fetcher.mockResolvedValue(providerResponse(copy));
});

it('requires a verified admin before validating inputs or calling the AI provider', async () => {
  const preflight = await handle(new Request('https://example.test/marketing-draft', { method: 'OPTIONS' }));
  expect(preflight.status).toBe(200);
  expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  expect((await handle(new Request('https://example.test/marketing-draft', { method: 'POST' }))).status).toBe(401);
  rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(request())).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects invalid budgets, durations, goals and off-site destinations', async () => {
  for (const invalid of [
    { ...brief, dailyBudgetInr: 99 },
    { ...brief, durationDays: 31 },
    { ...brief, goal: 'engagement' },
    { ...brief, landingPageUrl: 'https://example.org/' },
    { ...brief, landingPageUrl: 'http://luviacreations.com/' },
  ]) {
    expect((await handle(request(invalid))).status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('returns a validated proposal with the user budget and total computed server-side', async () => {
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    proposal: {
      ...brief,
      ...copy,
      totalBudgetInr: 3500,
    },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  expect(JSON.stringify(fetcher.mock.calls[0][1].body)).toContain('never as instructions');
});

it('does not accept malformed AI output or expose provider error details', async () => {
  fetcher.mockResolvedValueOnce(providerResponse({ ...copy, headlines: ['Only one'] }));
  expect((await handle(request())).status).toBe(502);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'secret provider details' } }), { status: 400 }));
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret provider details');
});

it('sends full product facts to AI while rejecting oversized inputs explicitly', async () => {
  const productOrOffer = `${'Complete product facts. '.repeat(40)}Final product detail.`;
  const targetLocation = 'Mumbai, Maharashtra, India; Bengaluru, Karnataka, India; Pune, Maharashtra, India; Chennai, Tamil Nadu, India';
  const response = await handle(request({ ...brief, productOrOffer, targetLocation }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ proposal: { productOrOffer, targetLocation } });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[0].text).toContain(productOrOffer);
  fetcher.mockClear();
  const oversized = await handle(request({ ...brief, productOrOffer: 'x'.repeat(10001) }));
  expect(oversized.status).toBe(400);
  expect(await oversized.text()).toContain('10,000 characters');
  expect(fetcher).not.toHaveBeenCalled();
});
