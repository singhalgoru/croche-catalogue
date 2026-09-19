import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRODUCT_CATEGORIES = [
  'Hair Accessories',
  'Rakhi',
  'Anklets',
  'Brooches',
  'Charms & Keychains',
  'Festive Decor',
  'Toys',
];

interface AnalyzeRequest {
  imageBase64?: unknown;
  mimeType?: unknown;
}

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

  const prompt = [
    'You are writing catalogue copy for Luvia, an Indian handmade crochet brand.',
    'Study the uploaded product photo and return accurate product metadata.',
    `Choose exactly one category from: ${PRODUCT_CATEGORIES.join(', ')}.`,
    'Use a concise, appealing product name of 2-7 words.',
    'Write one warm, factual description of 20-45 words. Do not invent materials, dimensions,',
    'safety claims, prices, availability, or features that are not visible.',
    'Return the dominant product colour as a six-digit hexadecimal colour.',
  ].join(' ');

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
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
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['name', 'category', 'description', 'color'],
            properties: {
              name: { type: 'STRING' },
              category: { type: 'STRING', enum: PRODUCT_CATEGORIES },
              description: { type: 'STRING' },
              color: {
                type: 'STRING',
                description: 'Dominant product colour in #RRGGBB format.',
              },
            },
          },
        },
      }),
    },
  );

  if (!geminiResponse.ok) {
    const errorPayload = await geminiResponse.json().catch(() => null);
    const apiMessage =
      errorPayload &&
      typeof errorPayload === 'object' &&
      'error' in errorPayload &&
      errorPayload.error &&
      typeof errorPayload.error === 'object' &&
      'message' in errorPayload.error &&
      typeof errorPayload.error.message === 'string'
        ? errorPayload.error.message
        : `Gemini request failed with status ${geminiResponse.status}.`;
    return jsonResponse({ error: apiMessage }, 502);
  }

  const geminiPayload = await geminiResponse.json();
  const responseText = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof responseText !== 'string') {
    return jsonResponse({ error: 'Gemini did not return product details.' }, 502);
  }

  try {
    return jsonResponse(JSON.parse(responseText));
  } catch {
    return jsonResponse({ error: 'Gemini returned malformed product details.' }, 502);
  }
});
