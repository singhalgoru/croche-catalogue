import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptMetaToken } from '../_shared/metaCredentials.ts';
import { checkState, exchangeCode, loginUrl, makeState, oauthConfig } from './oauth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !serviceKey) return json({ error: 'Supabase function environment is incomplete.' }, 500);
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication is required.' }, 401);
  const { data: isAdmin, error: adminError } = await client.rpc('is_catalogue_admin');
  if (adminError) return json({ error: 'Unable to verify admin access.' }, 500);
  if (!isAdmin) return json({ error: 'Fresh admin verification is required to reconnect Meta.' }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('action' in body)) return json({ error: 'Invalid request.' }, 400);
  try {
    const env = (name: string) => Deno.env.get(name);
    const config = oauthConfig(env);
    if (body.action === 'start' && Object.keys(body).length === 1) {
      const state = await makeState(userData.user.id, config.stateSecret);
      return json({ url: loginUrl(config, state), state });
    }
    if (body.action !== 'complete' || Object.keys(body).length !== 3 || !('code' in body) || !('state' in body)
      || typeof body.code !== 'string' || !body.code || body.code.length > 4096
      || typeof body.state !== 'string' || body.state.length > 4096) return json({ error: 'Invalid request.' }, 400);
    await checkState(body.state, userData.user.id, config.stateSecret);
    const { token, expiresAt } = await exchangeCode(env, config, body.code);
    const ciphertext = await encryptMetaToken(token, config.encryptionKey);
    const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error } = await serviceClient.from('meta_marketing_credential').upsert({
      id: true, ciphertext, expires_at: expiresAt, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('Unable to save the Meta credential.');
    return json({ expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reconnect Meta.';
    console.error('Meta reconnect failed:', message);
    return json({ error: message }, 502);
  }
}

Deno.serve(handler);
