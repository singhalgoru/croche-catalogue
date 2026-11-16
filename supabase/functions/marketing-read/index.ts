import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchMetaOverview, readMetaConfig } from './meta.ts';
import { decryptMetaToken } from '../_shared/metaCredentials.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
});

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication is required.' }, 401);
  const { data: isAdmin, error: adminError } = await authClient.rpc('is_catalogue_admin');
  if (adminError) return json({ error: 'Unable to verify admin access.' }, 500);
  if (!isAdmin) return json({ error: 'This account is not authorized to view marketing data.' }, 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'The request body must be valid JSON.' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 0) {
    return json({ error: 'The read-only request body must be an empty JSON object.' }, 400);
  }

  let config;
  let expiresAt: string | null = null;
  try {
    const encryptionKey = Deno.env.get('META_TOKEN_ENCRYPTION_KEY');
    let accessToken: string | undefined;
    if (Deno.env.get('META_OAUTH_STATE_SECRET') && !encryptionKey) {
      throw new Error('Meta credential encryption key is missing.');
    }
    if (encryptionKey) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) throw new Error('Meta credential storage is not configured.');
      const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await serviceClient.from('meta_marketing_credential')
        .select('ciphertext, expires_at').eq('id', true).maybeSingle();
      if (error) throw new Error('Unable to read the stored Meta credential.');
      if (data) {
        accessToken = await decryptMetaToken(data.ciphertext, encryptionKey);
        expiresAt = data.expires_at;
        if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) throw new Error('Stored Meta credential expiry is invalid.');
        if (Date.parse(expiresAt) <= Date.now()) throw new Error('Meta access has expired. Reconnect Meta.');
      }
    }
    config = readMetaConfig(name => name === 'META_ACCESS_TOKEN' && accessToken ? accessToken : Deno.env.get(name));
  } catch (error) {
    console.error('Meta credential configuration failed.');
    const message = error instanceof Error && /^(Meta |META_|Unable to read|Stored Meta)/.test(error.message)
      ? error.message : 'Unable to decrypt the stored Meta credential.';
    return json({ error: message }, 503);
  }

  try {
    return json({ ...await fetchMetaOverview(config), tokenExpiresAt: expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Meta marketing data.';
    console.error('Meta marketing read failed:', message);
    return json({ error: message }, 502);
  }
}

Deno.serve(handler);
