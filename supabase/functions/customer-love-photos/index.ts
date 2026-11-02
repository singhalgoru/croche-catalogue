import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const FOLDER = 'customer-reviews';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_KEY = /^customer-reviews\/([0-9a-f-]{36})-[0-9a-f]{16}\.webp$/;
// Keys include a content hash and are never overwritten with different bytes.
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

type Source = { id: string; sha256: string | null; photo: string | null };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
type R2 = { client: AwsClient; endpoint: string; publicUrl: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
});

const r2Config = (): R2 | null => {
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

const decodeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const listKeys = async (r2: R2, prefix: string) => {
  const keys: string[] = [];
  let token: string | null = null;
  do {
    const query = new URLSearchParams({ 'list-type': '2', prefix });
    if (token) query.set('continuation-token', token);
    const response = await r2.client.fetch(`${r2.endpoint}?${query}`);
    if (!response.ok) throw new Error(`R2 listing failed with status ${response.status}.`);
    const xml = await response.text();
    keys.push(...[...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match => decodeXml(match[1])));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? decodeXml(xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? '') || null : null;
  } while (token);
  return keys;
};

const sources = async (rpc: Rpc, id: string | null, includePhoto: boolean): Promise<Source[]> => {
  const { data, error } = await rpc('customer_love_photo_sources', { testimonial_id: id, include_photo: includePhoto });
  if (error) throw new Error(`Unable to read testimonial photos: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Invalid testimonial photo response.');
  return data as Source[];
};

async function syncOne(r2: R2, rpc: Rpc, id: string, existing: string[]) {
  const [source] = await sources(rpc, id, true);
  const desired = source?.sha256 && source.photo ? `${FOLDER}/${id}-${source.sha256.slice(0, 16)}.webp` : null;
  if (desired && source?.photo) {
    if (!existing.includes(desired)) {
      const bytes = Uint8Array.from(atob(source.photo), char => char.charCodeAt(0));
      const response = await r2.client.fetch(`${r2.endpoint}/${desired}`, {
        method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/webp', 'Cache-Control': IMMUTABLE_CACHE },
      });
      if (!response.ok) throw new Error(`R2 upload failed with status ${response.status}.`);
    }
    const { data, error } = await rpc('set_customer_love_image_url', {
      testimonial_id: id, image_sha256: source.sha256, url: `${r2.publicUrl}/${desired}`,
    });
    if (error) throw new Error(`Unable to record the R2 photo: ${error.message}`);
    // The testimonial changed during upload; the next sync for it removes or confirms this object.
    if (data !== true) return { id, published: false, removed: 0, changed: true };
  } else {
    const { error } = await rpc('set_customer_love_image_url', { testimonial_id: id, image_sha256: null, url: null });
    if (error) throw new Error(`Unable to clear the R2 photo: ${error.message}`);
  }
  const stale = existing.filter(key => key !== desired);
  const results = await Promise.all(stale.map(key => r2.client.fetch(`${r2.endpoint}/${key}`, { method: 'DELETE' })));
  const failed = results.find(response => !response.ok && response.status !== 404);
  if (failed) throw new Error(`R2 delete failed with status ${failed.status}.`);
  return { id, published: Boolean(desired), removed: stale.length, changed: false };
}

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);
  const r2 = r2Config();
  if (!r2) return json({ error: 'R2 image storage is not configured.' }, 501);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData } = await authClient.auth.getUser();
  if (userData?.user) {
    const { data: isAdmin, error: adminError } = await authClient.rpc('is_catalogue_admin');
    if (adminError) return json({ error: 'Unable to verify admin access.' }, 500);
    if (!isAdmin) return json({ error: 'This account is not authorized to manage the catalogue.' }, 403);
  } else {
    // Operators may reconcile with a service-role token; the database verifies it because only service_role may run this RPC.
    const { error: operatorError } = await authClient.rpc('customer_love_photo_sources', { testimonial_id: null, include_photo: false });
    if (operatorError) return json({ error: 'Authentication is required.' }, 401);
  }

  let payload: { id?: unknown };
  try { payload = await request.json(); } catch { return json({ error: 'The request body must be valid JSON.' }, 400); }
  if (payload.id !== undefined && (typeof payload.id !== 'string' || !ID.test(payload.id))) {
    return json({ error: 'Invalid testimonial reference.' }, 400);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rpc: Rpc = (name, args) => admin.rpc(name, args);
  try {
    const id = typeof payload.id === 'string' ? payload.id.toLowerCase() : null;
    const keys = await listKeys(r2, id ? `${FOLDER}/${id}-` : `${FOLDER}/`);
    const byId = new Map<string, string[]>();
    for (const key of keys) {
      const owner = key.match(OBJECT_KEY)?.[1];
      if (owner) byId.set(owner, [...(byId.get(owner) ?? []), key]);
    }
    const ids = id ? [id] : [...new Set([...(await sources(rpc, null, false)).map(item => item.id), ...byId.keys()])];
    const results = [];
    for (const item of ids) results.push(await syncOne(r2, rpc, item, byId.get(item) ?? []));
    return json({ results });
  } catch (error) {
    console.error('Customer Love photo sync failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: error instanceof Error ? error.message : 'Unable to sync testimonial photos.' }, 502);
  }
}

Deno.serve(handler);
