import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  imageBase64?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  productName?: unknown;
  existingVariantNames?: unknown;
}

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  if (!request.headers.get('Authorization')) {
    return jsonResponse({ error: 'Authentication is required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase function environment is incomplete.' }, 500);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: request.headers.get('Authorization')! },
    },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminError } = await authClient.rpc('is_catalogue_admin');
  if (adminError) {
    return jsonResponse({ error: `Unable to verify admin access: ${adminError.message}` }, 500);
  }
  if (!isAdmin) {
    return jsonResponse({ error: 'This account is not authorized to manage the catalogue.' }, 403);
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not configured.' }, 500);
  }

  let payload: AnalyzeRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'The request body must be valid JSON.' }, 400);
  }

  const isVariantMode = payload.mode === 'variant-name';
  let productCategories: string[] = [];
  if (!isVariantMode) {
    const { data: categoryRows, error: categoryError } = await authClient
      .from('categories')
      .select('name')
      .order('sort_order')
      .order('name');
    if (categoryError) {
      return jsonResponse(
        { error: `Unable to load product categories: ${categoryError.message}` },
        500,
      );
    }

    productCategories = categoryRows.map((category) => category.name);
    if (productCategories.length === 0) {
      return jsonResponse({ error: 'Create at least one product category before analysis.' }, 400);
    }
  }

  if (
    typeof payload.imageBase64 !== 'string' ||
    payload.imageBase64.length === 0 ||
    payload.imageBase64.length > 8_500_000
  ) {
    return jsonResponse({ error: 'A valid image smaller than 6 MB is required.' }, 400);
  }

  if (
    typeof payload.mimeType !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(payload.mimeType)
  ) {
    return jsonResponse({ error: 'Only JPG, PNG, and WebP images are supported.' }, 400);
  }

  const productName = sanitizeText(payload.productName, 120);
  const existingVariantNames = Array.isArray(payload.existingVariantNames)
    ? payload.existingVariantNames
        .map((name) => sanitizeText(name, 60))
        .filter(Boolean)
        .slice(0, 40)
    : [];

  const buildVariantPrompt = (rejectedNames: string[]) =>
    [
      'You name colour/style variants for Luvia, an Indian handmade crochet brand.',
      'Study the uploaded variant photo and suggest a short, customer-friendly variant name.',
      productName ? `The product is "${productName}".` : '',
      existingVariantNames.length > 0
        ? `Existing variant names for this product are: ${existingVariantNames
            .map((name) => `"${name}"`)
            .join(', ')}. Follow the same naming pattern, wording style, and casing,` +
          ' and never repeat an existing name.'
        : 'Use a simple colour or pattern name such as "Lavender", "Rose Pink", or "Rainbow Stripes".',
      'Name the most distinguishing visible feature: colour, colour combination, pattern,',
      'stitch texture, or motif (e.g. stripes, polka dots, floral, ombre, checks, bobble, shell stitch).',
      'If the colour matches an existing variant, keep the colour word but add the pattern or',
      'texture that makes this one different, e.g. "Lavender Stripes" or "Lavender Floral".',
      rejectedNames.length > 0
        ? `These names are already taken, so do not use them: ${rejectedNames
            .map((name) => `"${name}"`)
            .join(', ')}.`
        : '',
      'Use 1-4 words. Do not include the product name, sizes, prices, or marketing words.',
      'Return the dominant variant colour as a six-digit hexadecimal colour.',
    ]
      .filter(Boolean)
      .join(' ');

  const prompt = isVariantMode
    ? buildVariantPrompt([])
    : [
        'You are writing catalogue copy for Luvia, an Indian handmade crochet brand.',
        'Study the uploaded product photo and return accurate product metadata.',
        `Choose exactly one category from: ${productCategories.join(', ')}.`,
        'Use a concise, appealing product name of 2-7 words.',
        'Write one warm, factual description of 20-45 words. Do not invent materials, dimensions,',
        'safety claims, prices, availability, or features that are not visible.',
        'Return the dominant product colour as a six-digit hexadecimal colour.',
      ].join(' ');

  const colorSchema = {
    type: 'STRING',
    description: 'Dominant colour in #RRGGBB format.',
  };
  const responseSchema = isVariantMode
    ? {
        type: 'OBJECT',
        required: ['name', 'color'],
        properties: {
          name: { type: 'STRING' },
          color: colorSchema,
        },
      }
    : {
        type: 'OBJECT',
        required: ['name', 'category', 'description', 'color'],
        properties: {
          name: { type: 'STRING' },
          category: { type: 'STRING', enum: productCategories },
          description: { type: 'STRING' },
          color: colorSchema,
        },
      };

  const buildRequestBody = (promptText: string) =>
    JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: payload.mimeType,
                data: payload.imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: isVariantMode ? 0.5 : 0.3,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

  const models = ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

  const callGemini = async (
    requestBody: string,
  ): Promise<{ data: Record<string, unknown> } | { error: string }> => {
    let geminiResponse: Response | null = null;
    let apiMessage = '';

    for (const model of models) {
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          },
        );
      } catch (error) {
        apiMessage =
          error instanceof Error
            ? `${model} could not be reached: ${error.message}`
            : `${model} could not be reached.`;
        continue;
      }

      if (geminiResponse.ok) {
        break;
      }

      const errorPayload = await geminiResponse.json().catch(() => null);
      apiMessage =
        errorPayload &&
        typeof errorPayload === 'object' &&
        'error' in errorPayload &&
        errorPayload.error &&
        typeof errorPayload.error === 'object' &&
        'message' in errorPayload.error &&
        typeof errorPayload.error.message === 'string'
          ? errorPayload.error.message
          : `Gemini request failed with status ${geminiResponse.status}.`;

      if (geminiResponse.status !== 429 && geminiResponse.status < 500) {
        break;
      }
    }

    if (!geminiResponse?.ok) {
      return { error: apiMessage || 'Gemini analysis failed.' };
    }

    const geminiPayload = await geminiResponse.json();
    const responseText = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof responseText !== 'string') {
      return { error: 'Gemini did not return product details.' };
    }

    try {
      const parsed: unknown = JSON.parse(responseText);
      if (!parsed || typeof parsed !== 'object') {
        return { error: 'Gemini returned malformed product details.' };
      }
      return { data: parsed as Record<string, unknown> };
    } catch {
      return { error: 'Gemini returned malformed product details.' };
    }
  };

  if (!isVariantMode) {
    const result = await callGemini(buildRequestBody(prompt));
    return 'error' in result ? jsonResponse({ error: result.error }, 502) : jsonResponse(result.data);
  }

  // Variants can share a colour, so re-ask with the taken names until the suggestion is unique.
  const takenNames = new Set(existingVariantNames.map((name) => name.toLowerCase()));
  const rejectedNames: string[] = [];
  let lastSuggestion: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await callGemini(buildRequestBody(buildVariantPrompt(rejectedNames)));
    if ('error' in result) {
      return jsonResponse({ error: result.error }, 502);
    }

    lastSuggestion = result.data;
    const name = typeof result.data.name === 'string' ? result.data.name.trim() : '';
    if (name && !takenNames.has(name.toLowerCase())) {
      return jsonResponse({ ...result.data, name });
    }
    if (name) rejectedNames.push(name);
  }

  return jsonResponse(lastSuggestion ?? { error: 'Gemini did not suggest a variant name.' });
});
