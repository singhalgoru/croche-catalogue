import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_STYLE_INSTRUCTION_LENGTH = 300;

interface OptimizePromptRequest {
  styleDirection?: unknown;
}

interface GeminiPromptResponse {
  prompt?: unknown;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const getGeminiErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => null);
  return payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
    ? payload.error.message
    : `Gemini request failed with status ${response.status}.`;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return jsonResponse({ error: 'Authentication is required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase function environment is incomplete.' }, 500);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
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

  let payload: OptimizePromptRequest;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'The request body must be valid JSON.' }, 400);
  }

  if (typeof payload.styleDirection !== 'string' || !payload.styleDirection.trim()) {
    return jsonResponse({ error: 'A rough styling idea is required.' }, 400);
  }

  const styleDirection = payload.styleDirection.trim();
  if (styleDirection.length > MAX_STYLE_INSTRUCTION_LENGTH) {
    return jsonResponse(
      { error: 'Raw styling instructions must be 300 characters or less.' },
      400,
    );
  }

  const prompt = [
    'You write concise image-editing prompts for Cloudflare Workers AI image generation.',
    'Rewrite the rough styling idea into one polished styling direction for a handmade crochet',
    'product catalogue photo. Keep it specific, visual, premium, and safe for image editing.',
    'Preserve the original product exactly: shape, crochet stitches, colours, proportions, and',
    'visible details. Do not request redesigning, recolouring, duplicating, text, logos, labels,',
    'prices, watermarks, or extra product parts. Keep the result under 300 characters.',
    `Rough styling idea: ${styleDirection}`,
  ].join(' ');

  const requestBody = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'STRING',
            description: 'Optimized Cloudflare image styling direction, max 300 characters.',
          },
        },
      },
    },
  });

  const models = ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
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

    apiMessage = await getGeminiErrorMessage(geminiResponse);

    if (geminiResponse.status !== 429 && geminiResponse.status < 500) {
      break;
    }
  }

  if (!geminiResponse?.ok) {
    return jsonResponse({ error: apiMessage || 'Gemini prompt optimization failed.' }, 502);
  }

  const geminiPayload = await geminiResponse.json();
  const responseText = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof responseText !== 'string') {
    return jsonResponse({ error: 'Gemini did not return an optimized prompt.' }, 502);
  }

  let parsedResponse: GeminiPromptResponse;
  try {
    parsedResponse = JSON.parse(responseText) as GeminiPromptResponse;
  } catch {
    return jsonResponse({ error: 'Gemini returned a malformed optimized prompt.' }, 502);
  }

  if (typeof parsedResponse.prompt !== 'string' || !parsedResponse.prompt.trim()) {
    return jsonResponse({ error: 'Gemini returned an empty optimized prompt.' }, 502);
  }

  const optimizedPrompt = parsedResponse.prompt.trim();
  if (optimizedPrompt.length > MAX_STYLE_INSTRUCTION_LENGTH) {
    return jsonResponse(
      { error: 'Gemini returned an optimized prompt longer than 300 characters.' },
      502,
    );
  }

  return jsonResponse({ prompt: optimizedPrompt });
});
