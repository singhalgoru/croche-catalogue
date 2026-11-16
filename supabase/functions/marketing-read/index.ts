import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchMetaOverview, readMetaConfig } from './meta.ts';

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
  try {
    config = readMetaConfig(name => Deno.env.get(name));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Meta read access is not configured.' }, 503);
  }

  try {
    return json(await fetchMetaOverview(config));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Meta marketing data.';
    console.error('Meta marketing read failed:', message);
    return json({ error: message }, 502);
  }
}

Deno.serve(handler);
