import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIZE_FIELDS = ['w160', 'w480', 'w960'] as const;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_DELETE_PATHS = 50;
const R2_PATH = /^r2:(products\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+)$/;
// Every upload uses a fresh random key and is never overwritten.
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const getR2Config = () => {
  const accountId = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET');
  const publicUrl = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
    publicUrl,
  };
};

type R2Config = NonNullable<ReturnType<typeof getR2Config>>;

const objectKeys = (base: string) => [
  `${base}.webp`,
  ...SIZE_FIELDS.map((field) => `${base}-${field}.webp`),
];

const putObject = async (r2: R2Config, key: string, file: File) => {
  const response = await r2.client.fetch(`${r2.endpoint}/${key}`, {
    method: 'PUT',
    body: new Uint8Array(await file.arrayBuffer()),
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': IMMUTABLE_CACHE },
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}: ${await response.text()}`);
  }
};

const deleteObjects = async (r2: R2Config, keys: string[]) => {
  const results = await Promise.all(
    keys.map((key) => r2.client.fetch(`${r2.endpoint}/${key}`, { method: 'DELETE' })),
  );
  const failed = results.find((response) => !response.ok && response.status !== 404);
  if (failed) throw new Error(`R2 delete failed with status ${failed.status}.`);
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

  const r2 = getR2Config();
  if (!r2) {
    return jsonResponse({ error: 'R2 image storage is not configured.' }, 501);
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
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Authentication is required.' }, 401);
  }
  const { data: isAdmin, error: adminError } = await authClient.rpc('is_catalogue_admin');
  if (adminError) {
    return jsonResponse({ error: `Unable to verify admin access: ${adminError.message}` }, 500);
  }
  if (!isAdmin) {
    return jsonResponse({ error: 'This account is not authorized to manage the catalogue.' }, 403);
  }

  const contentType = request.headers.get('Content-Type') ?? '';

  if (contentType.includes('application/json')) {
    let payload: { action?: unknown; paths?: unknown };
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'The request body must be valid JSON.' }, 400);
    }
    if (payload.action !== 'delete' || !Array.isArray(payload.paths)) {
      return jsonResponse({ error: 'Unsupported image storage action.' }, 400);
    }
    if (payload.paths.length > MAX_DELETE_PATHS) {
      return jsonResponse({ error: `Delete at most ${MAX_DELETE_PATHS} images at once.` }, 400);
    }

    const bases: string[] = [];
    for (const path of payload.paths) {
      const match = typeof path === 'string' ? R2_PATH.exec(path) : null;
      if (!match) return jsonResponse({ error: 'Invalid image path.' }, 400);
      bases.push(match[1]);
    }

    try {
      await deleteObjects(r2, bases.flatMap(objectKeys));
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'R2 delete failed.' }, 502);
    }
    return jsonResponse({ deleted: bases.length });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: 'Upload the image as multipart form data.' }, 400);
  }

  const files = new Map<string, File>();
  for (const field of ['full', ...SIZE_FIELDS]) {
    const value = form.get(field);
    if (!(value instanceof File) || value.size === 0 || value.size > MAX_FILE_BYTES) {
      return jsonResponse({ error: `A WebP image smaller than 6 MB is required for "${field}".` }, 400);
    }
    if (value.type !== 'image/webp') {
      return jsonResponse({ error: 'Only WebP images can be stored.' }, 400);
    }
    files.set(field, value);
  }

  const base = `products/${userData.user.id}/${crypto.randomUUID()}`;
  const uploads: Array<[string, File]> = [
    [`${base}.webp`, files.get('full')!],
    ...SIZE_FIELDS.map((field): [string, File] => [`${base}-${field}.webp`, files.get(field)!]),
  ];

  try {
    await Promise.all(uploads.map(([key, file]) => putObject(r2, key, file)));
  } catch (error) {
    await deleteObjects(r2, objectKeys(base)).catch(() => {});
    return jsonResponse({ error: error instanceof Error ? error.message : 'R2 upload failed.' }, 502);
  }

  return jsonResponse({ imagePath: `r2:${base}`, imageUrl: `${r2.publicUrl}/${base}.webp` });
});
