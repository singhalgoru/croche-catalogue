import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parsePostalResponse } from './postal.ts';

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
  if (!url || !anonKey || !serviceKey) return json({ error: 'PIN verification is not configured.' }, 500);
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Cart authentication has expired. Please refresh.' }, 401);
  let body: { cartId?: unknown; pin?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body !== 'object' || typeof body.cartId !== 'string'
    || !/^[0-9a-f-]{36}$/i.test(body.cartId) || typeof body.pin !== 'string' || !/^[1-9][0-9]{5}$/.test(body.pin)) {
    return json({ error: 'Enter a valid 6-digit Indian PIN code or keep it empty.' }, 400);
  }
  const { data: cart, error: cartError } = await client.from('carts').select('id,expires_at,cart_items(id)')
    .eq('id', body.cartId).eq('user_id', auth.user.id).maybeSingle();
  if (cartError) return json({ error: 'Unable to check your cart. Please retry.' }, 500);
  if (!cart || new Date(cart.expires_at).getTime() <= Date.now() || !cart.cart_items?.length) {
    return json({ error: 'Add a product to an active cart before saving a PIN code.' }, 400);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: reserved, error: reserveError } = await admin.rpc('reserve_cart_pin_lookup', { cart_id: cart.id, owner_id: auth.user.id });
  if (reserveError?.message === 'This cart session has been blocked.') {
    return json({ error: 'This cart session has been blocked. Please contact Luvia if you think this is a mistake.' }, 403);
  }
  if (reserveError) return json({ error: 'Unable to start PIN verification. Please retry.' }, 500);
  if (!reserved) return json({ error: 'Please wait 10 seconds before retrying PIN verification.' }, 429);
  const { data: cached, error: cacheError } = await admin.from('delivery_pin_cache').select('location,checked_at')
    .eq('pin', body.pin).gte('checked_at', new Date(Date.now() - 30 * 86400_000).toISOString()).maybeSingle();
  if (cacheError) return json({ error: 'Unable to read PIN verification data. Please retry.' }, 500);
  let location = cached?.location;
  let checkedAt = cached?.checked_at;
  if (!cached) {
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${body.pin}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Postal lookup responded HTTP ${response.status}.`);
      location = parsePostalResponse(await response.json(), body.pin);
    } catch (error) {
      console.error('Postal lookup failed:', error instanceof Error ? error.message : 'Unknown lookup error');
      return json({ error: 'PIN verification is temporarily unavailable. Please retry, or clear the PIN and enquire without it.' }, 503);
    }
    if (!location) return json({ error: 'Enter a valid PIN code or keep it empty.' }, 422);
    checkedAt = new Date().toISOString();
    const { error } = await admin.from('delivery_pin_cache').upsert({ pin: body.pin, location, checked_at: checkedAt });
    if (error) return json({ error: 'Unable to store PIN verification data. Please retry.' }, 500);
  }
  const { data: saved, error: saveError } = await admin.from('carts').update({
    delivery_pin_code: body.pin, delivery_pin_location: location, delivery_pin_checked_at: checkedAt,
    updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  }).eq('id', cart.id).eq('user_id', auth.user.id).gt('expires_at', new Date().toISOString())
    .select('id').maybeSingle();
  if (saveError || !saved) return json({ error: 'Unable to save the verified PIN to your cart. Please retry.' }, 500);
  return json({ location, checkedAt });
});
