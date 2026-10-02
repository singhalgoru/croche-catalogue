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
  provider?: unknown;
}

interface ImageGenerationResult {
  imageBase64: string;
  mimeType: string;
  provider: string;
  model: string;
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

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
};

const callOpenAi = async (
  apiKey: string,
  inputBlob: Blob,
  mimeType: string,
  prompt: string,
): Promise<ImageGenerationResult> => {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const formData = new FormData();
  formData.append('image', inputBlob, `product.${extension}`);
  formData.append('prompt', prompt);
  formData.append('size', '1024x1024');
  formData.append('response_format', 'b64_json');

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`OpenAI could not be reached${message}`);
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const rawMessage =
      errorPayload &&
      typeof errorPayload === 'object' &&
      'error' in errorPayload &&
      errorPayload.error &&
      typeof errorPayload.error === 'object' &&
      'message' in errorPayload.error &&
      typeof errorPayload.error.message === 'string'
        ? errorPayload.error.message
        : `OpenAI image edit failed with status ${response.status}.`;

    const lower = rawMessage.toLowerCase();
    let message = rawMessage;
    if (response.status === 429 || lower.includes('quota') || lower.includes('insufficient_quota') || lower.includes('billing')) {
      message = 'OpenAI API quota exceeded or prepaid balance is empty. Switch AI Engine to "Cloudflare Workers AI" for free generation, or add credits at platform.openai.com/settings/organization/billing.';
    } else if (response.status === 401 || lower.includes('invalid_api_key')) {
      message = 'OpenAI rejected the API key. Check the OPENAI_API_KEY in Supabase secrets, or switch AI Engine to "Cloudflare Workers AI".';
    }
    throw new Error(message);
  }

  const payload = await response.json().catch(() => null);
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new Error('OpenAI completed without returning an edited image.');
  }

  return {
    imageBase64: b64,
    mimeType: 'image/png',
    provider: 'openai',
    model: 'dall-e-2',
  };
};

const callGeminiImage = async (
  apiKey: string,
  base64Image: string,
  mimeType: string,
  prompt: string,
): Promise<ImageGenerationResult> => {
  const models = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
  let geminiResponse: Response | null = null;
  let apiMessage = '';
  let successfulModel = models[0];

  const requestBody = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  });

  for (const model of models) {
    successfulModel = model;
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    const rawMessage =
      errorPayload &&
      typeof errorPayload === 'object' &&
      'error' in errorPayload &&
      errorPayload.error &&
      typeof errorPayload.error === 'object' &&
      'message' in errorPayload.error &&
      typeof errorPayload.error.message === 'string'
        ? errorPayload.error.message
        : `Gemini image generation failed with status ${geminiResponse.status}.`;

    if (rawMessage.toLowerCase().includes('limit: 0') || (rawMessage.toLowerCase().includes('quota') && rawMessage.toLowerCase().includes('free_tier'))) {
      apiMessage = 'Google Gemini sets image generation quota to 0 on the free tier. Switch AI Engine to "Cloudflare Workers AI" for free generation, or link a billing account in Google AI Studio (aistudio.google.com).';
    } else {
      apiMessage = rawMessage;
    }

    if (geminiResponse.status !== 429 && geminiResponse.status < 500) {
      break;
    }
  }

  if (!geminiResponse?.ok) {
    throw new Error(apiMessage || 'Gemini image generation failed.');
  }

  const payload = await geminiResponse.json();
  const parts = payload?.candidates?.[0]?.content?.parts;
  const imagePart = Array.isArray(parts)
    ? parts.find(
        (part: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }) =>
          typeof part?.inlineData?.data === 'string' ||
          typeof part?.inline_data?.data === 'string',
      )
    : null;

  const imageBase64 =
    imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  const returnedMimeType =
    imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || 'image/png';

  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new Error('Gemini completed without returning an image.');
  }

  return {
    imageBase64,
    mimeType: returnedMimeType,
    provider: 'gemini',
    model: successfulModel,
  };
};

const callCloudflareFlux = async (
  accountId: string,
  apiToken: string,
  inputBlob: Blob,
  mimeType: string,
  prompt: string,
): Promise<ImageGenerationResult> => {
  const model = '@cf/black-forest-labs/flux-2-klein-9b';
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('input_image_0', inputBlob, `product.${extension}`);
  formData.append('width', '1024');
  formData.append('height', '1024');

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: formData,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Cloudflare Workers AI could not be reached${message}`);
  }

  if (!response.ok) {
    throw new Error(await getApiMessage(response));
  }

  const cloudflarePayload = (await response.json().catch(() => null)) as CloudflareResponse | null;
  const generatedImage = cloudflarePayload?.result?.image;
  if (cloudflarePayload?.success !== true || typeof generatedImage !== 'string') {
    throw new Error('Cloudflare Workers AI completed without returning an edited image.');
  }

  return {
    imageBase64: generatedImage,
    mimeType: 'image/jpeg',
    provider: 'cloudflare',
    model,
  };
};

const callCloudflareSdFallback = async (
  accountId: string,
  apiToken: string,
  base64Image: string,
  prompt: string,
): Promise<ImageGenerationResult> => {
  const model = '@cf/runwayml/stable-diffusion-v1-5-img2img';
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_b64: base64Image,
          prompt,
          strength: 0.65,
          guidance: 7.5,
          num_steps: 20,
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(`Cloudflare SD fallback could not be reached${message}`);
  }

  if (!response.ok) {
    throw new Error(await getApiMessage(response));
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = (await response.json().catch(() => null)) as CloudflareResponse | null;
    if (json?.result?.image && typeof json.result.image === 'string') {
      return {
        imageBase64: json.result.image,
        mimeType: 'image/png',
        provider: 'cloudflare',
        model,
      };
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Cloudflare SD fallback returned an empty image stream.');
  }

  return {
    imageBase64: arrayBufferToBase64(arrayBuffer),
    mimeType: 'image/png',
    provider: 'cloudflare',
    model,
  };
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

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const cloudflareAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const cloudflareApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');

  const hasOpenAi = Boolean(openAiApiKey);
  const hasGemini = Boolean(geminiApiKey);
  const hasCloudflare = Boolean(cloudflareAccountId && cloudflareApiToken);

  if (!hasOpenAi && !hasGemini && !hasCloudflare) {
    return jsonResponse(
      {
        error:
          'No AI image provider is configured. Configure GEMINI_API_KEY, OPENAI_API_KEY, or Cloudflare credentials in Supabase secrets.',
      },
      500,
    );
  }

  const requestedProvider =
    typeof payload.provider === 'string' &&
    ['auto', 'cloudflare', 'openai', 'gemini'].includes(payload.provider)
      ? payload.provider
      : 'auto';

  if (requestedProvider === 'openai' && !hasOpenAi) {
    return jsonResponse(
      { error: 'OpenAI is selected but OPENAI_API_KEY is not configured in Supabase secrets.' },
      400,
    );
  }
  if (requestedProvider === 'gemini' && !hasGemini) {
    return jsonResponse(
      { error: 'Google Gemini is selected but GEMINI_API_KEY is not configured in Supabase secrets.' },
      400,
    );
  }
  if (requestedProvider === 'cloudflare' && !hasCloudflare) {
    return jsonResponse(
      {
        error:
          'Cloudflare is selected but CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not configured in Supabase secrets.',
      },
      400,
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
    'If the reference has a small round Luvia logo badge in a corner, remove it and fill',
    'that area naturally; the brand badge is added again after editing.',
    'Return only the edited image.',
  ]
    .filter(Boolean)
    .join(' ');

  const inputImage = base64ToBlob(payload.imageBase64, payload.mimeType);
  if (!inputImage) {
    return jsonResponse({ error: 'The uploaded image data is not valid Base64.' }, 400);
  }

  let result: ImageGenerationResult;

  if (requestedProvider === 'openai') {
    try {
      result = await callOpenAi(openAiApiKey!, inputImage, payload.mimeType, prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenAI image edit failed.';
      return jsonResponse({ error: message }, 502);
    }
  } else if (requestedProvider === 'gemini') {
    try {
      result = await callGeminiImage(geminiApiKey!, payload.imageBase64, payload.mimeType, prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini image generation failed.';
      return jsonResponse({ error: message }, 502);
    }
  } else if (requestedProvider === 'cloudflare') {
    try {
      result = await callCloudflareFlux(
        cloudflareAccountId!,
        cloudflareApiToken!,
        inputImage,
        payload.mimeType,
        prompt,
      );
    } catch (fluxError) {
      console.warn('Cloudflare FLUX failed, attempting SD 1.5 fallback:', fluxError);
      try {
        result = await callCloudflareSdFallback(
          cloudflareAccountId!,
          cloudflareApiToken!,
          payload.imageBase64,
          prompt,
        );
      } catch {
        const message =
          fluxError instanceof Error ? fluxError.message : 'Cloudflare Workers AI failed.';
        return jsonResponse({ error: message }, 502);
      }
    }
  } else {
    // 'auto' mode:
    // Priority order: OpenAI (if configured) -> Cloudflare Workers AI (free tier default) -> Google Gemini (if billing active)
    let lastError: Error | null = null;

    if (hasOpenAi) {
      try {
        result = await callOpenAi(openAiApiKey!, inputImage, payload.mimeType, prompt);
        return jsonResponse({
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
          provider: result.provider,
          model: result.model,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('OpenAI image edit failed.');
        console.warn('OpenAI failed in auto mode, trying next provider:', lastError.message);
      }
    }

    if (hasCloudflare) {
      try {
        result = await callCloudflareFlux(
          cloudflareAccountId!,
          cloudflareApiToken!,
          inputImage,
          payload.mimeType,
          prompt,
        );
        return jsonResponse({
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
          provider: result.provider,
          model: result.model,
        });
      } catch (fluxError) {
        console.warn('Cloudflare FLUX failed, attempting SD 1.5 fallback:', fluxError);
        try {
          result = await callCloudflareSdFallback(
            cloudflareAccountId!,
            cloudflareApiToken!,
            payload.imageBase64,
            prompt,
          );
          return jsonResponse({
            imageBase64: result.imageBase64,
            mimeType: result.mimeType,
            provider: result.provider,
            model: result.model,
          });
        } catch {
          const cloudflareMsg =
            fluxError instanceof Error ? fluxError.message : 'Cloudflare Workers AI failed.';
          lastError = new Error(cloudflareMsg);
          console.warn('Cloudflare failed in auto mode, trying next provider:', cloudflareMsg);
        }
      }
    }

    if (hasGemini) {
      try {
        result = await callGeminiImage(geminiApiKey!, payload.imageBase64, payload.mimeType, prompt);
        return jsonResponse({
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
          provider: result.provider,
          model: result.model,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Gemini image generation failed.');
        console.warn('Gemini failed in auto mode:', lastError.message);
      }
    }

    return jsonResponse(
      { error: lastError?.message || 'No available AI provider succeeded in generating the image.' },
      502,
    );
  }

  return jsonResponse({
    imageBase64: result.imageBase64,
    mimeType: result.mimeType,
    provider: result.provider,
    model: result.model,
  });
});
