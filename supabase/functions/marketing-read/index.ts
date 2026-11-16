import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchMetaOverview, searchMetaLocations, type MetaLocation } from './meta.ts';
import { loadMetaAccess } from '../_shared/loadMetaAccess.ts';

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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ error: 'The read-only request body must be a JSON object.' }, 400);
  }
  let locationSearch: { query: string; type: MetaLocation['type'] } | null = null;
  if (Object.keys(payload).length !== 0) {
    if (!('action' in payload) || payload.action !== 'search-locations'
      || !('query' in payload) || typeof payload.query !== 'string'
      || payload.query.trim().length < 2 || payload.query.trim().length > 100
      || !('locationType' in payload)
      || (payload.locationType !== 'region' && payload.locationType !== 'city' && payload.locationType !== 'zip')
      || Object.keys(payload).some(key => !['action', 'query', 'locationType'].includes(key))) {
      return json({ error: 'Use an empty object for the overview or a valid read-only location search.' }, 400);
    }
    locationSearch = { query: payload.query.trim(), type: payload.locationType };
  }

  let config;
  let expiresAt: string | null = null;
  try {
    ({ config, expiresAt } = await loadMetaAccess(name => Deno.env.get(name)));
  } catch (error) {
    console.error('Meta credential configuration failed.');
    const message = error instanceof Error && /^(Meta |META_|Unable to read|Stored Meta)/.test(error.message)
      ? error.message : 'Unable to decrypt the stored Meta credential.';
    return json({ error: message }, 503);
  }

  try {
    if (locationSearch) {
      return json({ locations: await searchMetaLocations(config, locationSearch.query, locationSearch.type) });
    }
    return json({ ...await fetchMetaOverview(config), tokenExpiresAt: expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Meta marketing data.';
    console.error('Meta marketing read failed:', message);
    return json({ error: message }, 502);
  }
}

Deno.serve(handler);
