import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isIP } from 'node:net';
import { lookupLocation } from './geolocation.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Cart authentication is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Cart network capture is not configured.' }, 500);
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Cart authentication has expired.' }, 401);
  let body: { cartId?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body.cartId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.cartId)) {
    return json({ error: 'A valid cart ID is required.' }, 400);
  }
  const { data: cart, error: cartError } = await client.from('carts')
    .select('id,expires_at,cart_items(id)').eq('id', body.cartId).eq('user_id', auth.user.id).maybeSingle();
  if (cartError) return json({ error: 'Unable to check your cart.' }, 500);
  if (!cart || new Date(cart.expires_at).getTime() <= Date.now() || !cart.cart_items?.length) {
    return json({ error: 'An active cart with products is required.' }, 400);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: blocked, error: blockError } = await admin.from('cart_session_blocks')
    .select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (blockError) return json({ error: 'Unable to check cart session access.' }, 500);
  if (blocked) return json({ error: 'This cart session has been blocked.' }, 403);
  const { data: existing, error: readError } = await admin.from('cart_network_details')
    .select('cart_id,ip_address,location,captured_at').eq('cart_id', cart.id).maybeSingle();
  if (readError) return json({ error: 'Unable to read cart network metadata.' }, 500);
  if (existing?.location || (existing && new Date(existing.captured_at).getTime() <= Date.now() - 30 * 86400_000)) {
    return json({ recorded: true });
  }
  // Gateway network metadata is not proof of shopper identity or location.
  const ip = existing?.ip_address ?? (request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? request.headers.get('x-real-ip'))?.trim();
  if (!ip || !isIP(ip)) return json({ error: 'A valid network address was not provided by the gateway.' }, 503);
  if (!existing) {
    const { error } = await admin.from('cart_network_details').upsert({
      cart_id: cart.id, ip_address: ip,
    }, { onConflict: 'cart_id', ignoreDuplicates: true });
    if (error) return json({ error: 'Unable to store cart network metadata.' }, 500);
  }
  try {
    const location = await lookupLocation(ip, async () => {
      const { data, error } = await admin.storage.from('geolocation-private').download('GeoLite2-City.mmdb');
      if (error || !data) throw new Error('GeoLite2 City database is unavailable in private storage.');
      return data;
    });
    if (!location) return json({ recorded: true, locationStatus: 'not_found' });
    const { error } = await admin.from('cart_network_details').update({ location })
      .eq('cart_id', cart.id).eq('ip_address', ip);
    if (error) throw new Error('Unable to save approximate cart location.');
    return json({ recorded: true, locationStatus: 'available' });
  } catch (error) {
    console.error('Cart geolocation failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ recorded: true, locationStatus: 'unavailable' });
  }
});
