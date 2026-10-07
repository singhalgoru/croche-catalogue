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
const geminiResponse = (
  value: unknown,
) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
}), { status: 200 });
const gstAcceleratorResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
let gstAcceleratorApiKey: string | undefined = 'test-provider-key';
const gstMatch = {
  hsn_code: '580810',
  description: 'Crocheted textile bag charm articles',
  tax_rates: { igst: 5, cgst: 2.5, sgst: 2.5, cess: 0, total_intrastate: 5 },
  condition_applied: null,
  condition_warning: null,
  confidence: 0.84,
  notification_ref: '09/2025-CT(Rate)',
  needs_review: true,
};

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-public-key',
      GEMINI_API_KEY: 'test-placeholder',
    })[name] ?? (name === 'GST_ACCELERATOR_API_KEY' ? gstAcceleratorApiKey : undefined) },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  gstAcceleratorApiKey = 'test-provider-key';
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
  it('looks up HSN and current GST rates from the provider using product facts without an image', async () => {
    fetchMock.mockResolvedValue(gstAcceleratorResponse([gstMatch]));
    const response = await handler(request({
      mode: 'gst-rate',
      imageBase64: undefined,
      mimeType: undefined,
      context: {
        category: 'Accessories', name: 'Crochet charm',
        description: 'Small handmade crochet bag charm.', materials: 'Cotton yarn',
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: 'GST Accelerator HSN lookup · CBIC-sourced rates',
      candidates: [{
        hsnCode: '580810',
        hsnDescription: 'Crocheted textile bag charm articles',
        gstRate: 5,
        igstRate: 5,
        cgstRate: 2.5,
        sgstRate: 2.5,
        cessRate: 0,
        confidence: 0.84,
        notificationRef: '09/2025-CT(Rate)',
        conditionApplied: null,
        conditionWarning: null,
        needsReview: true,
      }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gstaccelerator.in/api/v1/lookup',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-provider-key' },
        body: JSON.stringify({
          description: 'Crochet charm Small handmade crochet bag charm. product category: Accessories materials: Cotton yarn Crocheted textile finished product.',
          branded: false,
          supply_type: 'intrastate',
          top_k: 3,
        }),
      }),
    );
  });
  it('reports no provider HSN matches as a reviewable result rather than an API error', async () => {
    fetchMock.mockResolvedValue(gstAcceleratorResponse([]));
    const response = await handler(request({
      mode: 'gst-rate',
      imageBase64: undefined,
      mimeType: undefined,
      context: {
        category: 'Accessories',
        name: 'Panda Charm',
        description: 'Crochet panda bag charm for keyrings.',
        materials: 'Acrylic wool and fiber fill.',
      },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: 'GST Accelerator HSN lookup · CBIC-sourced rates',
      candidates: [],
      message: expect.stringContaining('found no HSN matches'),
    });
  });
  it('returns manual review when HSN matches have no usable GST rates', async () => {
    fetchMock.mockResolvedValue(gstAcceleratorResponse([{
      ...gstMatch,
      tax_rates: { igst: null, cgst: null, sgst: null, cess: null },
    }]));
    const response = await handler(request({
      mode: 'gst-rate',
      imageBase64: undefined,
      mimeType: undefined,
      context: {
        category: 'Accessories',
        name: 'Panda Charm',
        description: 'Crochet panda bag charm for keyrings.',
        materials: 'Acrylic wool and fiber fill.',
      },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      candidates: [],
      message: expect.stringContaining('did not supply a usable GST rate'),
    });
  });
  it('requires a current category and rejects invalid provider GST matches', async () => {
    const missingCategory = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined, context: { name: 'Charm' },
    }));
    expect(missingCategory.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const order = vi.fn();
    order.mockReturnValueOnce({ order })
      .mockResolvedValueOnce({ data: [{ name: 'Accessories' }], error: null });
    from.mockReturnValue({ select: () => ({ order }) });
    fetchMock.mockResolvedValue(gstAcceleratorResponse([{
      ...gstMatch, tax_rates: { ...gstMatch.tax_rates, igst: 180 },
    }]));
    const invalidMatch = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined,
      context: { category: 'Accessories', name: 'Charm' },
    }));
    expect(invalidMatch.status).toBe(502);
    expect(await invalidMatch.json()).toHaveProperty(
      'error',
      'The HSN provider returned an invalid igst tax rate (number).',
    );
  });
  it('surfaces provider authorization and quota errors without accepting ungrounded model guesses', async () => {
    const order = vi.fn();
    order.mockReturnValueOnce({ order })
      .mockResolvedValueOnce({ data: [{ name: 'Accessories' }], error: null });
    from.mockReturnValue({ select: () => ({ order }) });
    fetchMock.mockResolvedValue(gstAcceleratorResponse({ error: 'Invalid API key.' }, 401));

    const response = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined,
      context: { category: 'Accessories', name: 'Crochet charm' },
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'GST Accelerator lookup failed (401). Check the server-side API key and account quota.',
    });
  });
  it('returns actionable errors for missing provider credentials and malformed provider JSON', async () => {
    gstAcceleratorApiKey = undefined;
    const missingSecret = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined,
      context: { category: 'Accessories', name: 'Crochet charm' },
    }));
    expect(missingSecret.status).toBe(500);
    expect(await missingSecret.json()).toHaveProperty(
      'error',
      'GST_ACCELERATOR_API_KEY is not configured for the analyze-product function.',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    gstAcceleratorApiKey = 'test-provider-key';
    const order = vi.fn();
    order.mockReturnValueOnce({ order })
      .mockResolvedValueOnce({ data: [{ name: 'Accessories' }], error: null });
    from.mockReturnValue({ select: () => ({ order }) });
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }));
    const malformedResponse = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined,
      context: { category: 'Accessories', name: 'Crochet charm' },
    }));
    expect(malformedResponse.status).toBe(502);
    expect(await malformedResponse.json()).toHaveProperty(
      'error',
      'GST Accelerator returned an invalid response.',
    );
  });
  it('reports provider connection timeouts rather than returning a fallback classification', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted.'));
    const response = await handler(request({
      mode: 'gst-rate', imageBase64: undefined, mimeType: undefined,
      context: { category: 'Accessories', name: 'Crochet charm' },
    }));
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty(
      'error',
      'Unable to reach GST Accelerator: The operation was aborted.',
    );
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
