import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ rpc, from }),
}));

let handler: (request: Request) => Promise<Response>;
const fetchMock = vi.fn();
const request = (extra: Record<string, unknown> = {}) => new Request('https://example.test/analyze-product', {
  method: 'POST',
  headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64: 'aW1hZ2U=', mimeType: 'image/png', ...extra }),
});
const metadata = {
  name: 'Bunny', category: 'Accessories', description: 'A lavender bunny.', color: '#B57EDC',
  seoDescription: 'Handmade lavender crochet bunny keychain.',
  materials: '', dimensions: '', includedItems: '', careInstructions: '',
};
const geminiResponse = (value: unknown) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 });

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-public-key',
      GEMINI_API_KEY: 'test-placeholder',
    })[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  rpc.mockResolvedValue({ data: true, error: null });
  const order = vi.fn();
  order.mockReturnValueOnce({ order })
    .mockResolvedValueOnce({ data: [{ name: 'Accessories' }], error: null });
  from.mockReturnValue({ select: () => ({ order }) });
});

describe('analyze-product endpoint', () => {
  it('keeps product identity when generating descriptions in bulk mode', async () => {
    fetchMock.mockResolvedValue(geminiResponse(metadata));
    const response = await handler(request({ mode: 'descriptions', context: { name: 'Bunny', category: 'Accessories' } }));
    expect(response.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain('descriptions-only edit');
    expect(body.contents[0].parts[0].text).toContain('name and category unchanged');
  });
  it('keeps image-only analysis working with empty optional fields', async () => {
    fetchMock.mockResolvedValue(geminiResponse(metadata));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(metadata);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseSchema.required).toEqual([
      'name', 'category', 'description', 'seoDescription', 'color', 'materials', 'dimensions', 'includedItems', 'careInstructions',
    ]);
    expect(body.contents[0].parts[0].text).toContain('Never infer materials');
  });

  it('returns an explicit error for an overlong SEO summary', async () => {
    fetchMock.mockResolvedValue(geminiResponse({ ...metadata, seoDescription: `${'x'.repeat(161)}.` }));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty('error', expect.stringContaining('invalid SEO description'));
  });

  it('passes notes/current facts to Gemini and filters commercial metadata from its response', async () => {
    const context = { notes: 'Cotton, 10 cm, 1 keychain, spot clean', materials: 'Cotton' };
    const details = { materials: 'Cotton', dimensions: '10 cm', includedItems: '1 keychain', careInstructions: 'Spot clean' };
    fetchMock.mockResolvedValue(geminiResponse({ ...metadata, ...details, price: 999, in_stock: false, dispatch: 'Today' }));
    const response = await handler(request({ context }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...metadata, ...details });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain(JSON.stringify(context));
  });

  it.each([{ notes: 'x'.repeat(2001) }, { notes: 42 }, { dimensions: 'x'.repeat(1001) }, null])(
    'returns 400 for invalid context without calling Gemini', async (context) => {
      const response = await handler(request({ context }));
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty('error');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('returns 502 instead of serving photo-inferred facts', async () => {
    fetchMock.mockResolvedValue(geminiResponse({ ...metadata, materials: 'Cotton' }));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Gemini suggested product specifications without supplied facts.' });
  });

  it('keeps variant naming and its duplicate-name retry independent of product context', async () => {
    fetchMock.mockResolvedValueOnce(geminiResponse({ name: 'Lavender', color: '#B57EDC' }))
      .mockResolvedValueOnce(geminiResponse({ name: 'Lavender Stripes', color: '#B57EDC' }));
    const response = await handler(request({
      mode: 'variant-name', productName: 'Bunny', existingVariantNames: ['Lavender'],
      context: { notes: 'x'.repeat(2001) },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Lavender Stripes', color: '#B57EDC' });
    expect(from).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.generationConfig.responseSchema.required).toEqual(['name', 'color']);
    expect(body.contents[0].parts[0].text).toContain('These names are already taken');
  });
});
