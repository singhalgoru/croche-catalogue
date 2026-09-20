import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnhanceRequest {
  imageBase64?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  styleSuggestion?: unknown;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

interface CloudflareError {
  message?: unknown;
}

interface CloudflareResponse {
  success?: unknown;
  result?: {
    image?: unknown;
  };
  errors?: unknown;
}

const getApiMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as CloudflareResponse | null;
  const errors = Array.isArray(payload?.errors) ? (payload.errors as CloudflareError[]) : [];
  const providerMessage = errors.find((error) => typeof error?.message === 'string')?.message;

  if (response.status === 401 || response.status === 403) {
    return 'Cloudflare rejected the Account ID or API token. Check the Workers AI credentials.';
  }
  if (response.status === 429 || providerMessage?.toLowerCase().includes('quota')) {
    return 'The Cloudflare Workers AI daily free allowance has been used. Try again after 00:00 UTC.';
  }
  return typeof providerMessage === 'string'
    ? providerMessage
    : `Cloudflare Workers AI request failed with status ${response.status}.`;
};

const base64ToBlob = (base64: string, mimeType: string) => {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
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

  let payload: EnhanceRequest;
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
  if (payload.mode !== 'studio' && payload.mode !== 'lifestyle') {
    return jsonResponse({ error: 'Choose either studio or lifestyle image mode.' }, 400);
  }
  if (
    payload.styleSuggestion !== undefined &&
    (typeof payload.styleSuggestion !== 'string' || payload.styleSuggestion.length > 300)
  ) {
    return jsonResponse({ error: 'Image styling instructions must be 300 characters or less.' }, 400);
  }

  const cloudflareAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cloudflareApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!cloudflareAccountId || !cloudflareApiToken) {
    return jsonResponse(
      {
        error:
          'Cloudflare Workers AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
      },
      500,
    );
  }

  const modePrompt =
    payload.mode === 'studio'
      ? [
          'Create a polished square e-commerce studio photograph from this reference.',
          'Preserve the exact handmade crochet product, including its shape, stitching, colours,',
          'pattern, proportions, and all visible details. Remove the existing background only.',
          'Place the item naturally on a warm cream seamless backdrop with soft diffused daylight,',
          'a subtle realistic shadow, accurate colour, and no distracting props.',
        ].join(' ')
      : [
          'Create a polished square lifestyle catalogue photograph from this reference.',
          'Preserve the exact handmade crochet product, including its shape, stitching, colours,',
          'pattern, proportions, and all visible details. Show it naturally in an elegant, warm,',
          'minimal Indian lifestyle setting appropriate to how the product is used.',
          'Keep the product as the clear focal point with soft daylight and uncluttered styling.',
        ].join(' ');
  const prompt = [
    modePrompt,
    typeof payload.styleSuggestion === 'string' && payload.styleSuggestion.trim()
      ? `Styling direction: ${payload.styleSuggestion.trim()}`
      : '',
    'Do not redesign, recolour, duplicate, crop, obscure, or add parts to the product.',
    'Do not add people unless needed to demonstrate how the item is worn or used.',
    'Do not add text, logos, labels, borders, watermarks, or prices.',
    'Return only the edited image.',
  ]
    .filter(Boolean)
    .join(' ');

  const inputImage = base64ToBlob(payload.imageBase64, payload.mimeType);
  if (!inputImage) {
    return jsonResponse({ error: 'The uploaded image data is not valid Base64.' }, 400);
  }

  const model = '@cf/black-forest-labs/flux-2-klein-9b';
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('input_image_0', inputImage, `product.${payload.mimeType.split('/')[1]}`);
  formData.append('width', '1024');
  formData.append('height', '1024');

  let cloudflareResponse: Response;
  try {
    cloudflareResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${cloudflareApiToken}` },
        body: formData,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    return jsonResponse({ error: `Cloudflare Workers AI could not be reached${message}` }, 502);
  }

  if (!cloudflareResponse.ok) {
    return jsonResponse({ error: await getApiMessage(cloudflareResponse) }, 502);
  }

  const cloudflarePayload = (await cloudflareResponse.json().catch(() => null)) as
    | CloudflareResponse
    | null;
  const generatedImage = cloudflarePayload?.result?.image;
  if (cloudflarePayload?.success !== true || typeof generatedImage !== 'string') {
    return jsonResponse(
      { error: 'Cloudflare Workers AI completed without returning an edited image.' },
      502,
    );
  }

  return jsonResponse({
    imageBase64: generatedImage,
    mimeType: 'image/jpeg',
    model,
  });
});
