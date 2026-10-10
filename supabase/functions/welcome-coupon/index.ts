import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWelcomeEmail } from '../_shared/welcomeEmail.ts';
import { fetchWelcomeProducts } from '../_shared/welcomeProducts.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value),
  { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('WELCOME_COUPON_FROM_EMAIL');
  if (!apiKey || !sender) return json({ error: 'Welcome coupon email delivery is not configured yet.' }, 503);
  const url = Deno.env.get('SUPABASE_URL')!;
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Please sign in first.' }, 401);
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: 'Your account session has expired.' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: coupon, error: claimError } = await admin.rpc('claim_welcome_coupon', { owner_id: data.user.id });
  if (claimError) return json({ error: claimError.message }, 400);
  if (!coupon) return json({ error: 'Unable to prepare your welcome coupon.' }, 500);
  if (coupon.email_sent_at) return json({ coupon });
  try {
    await sendWelcomeEmail(coupon, apiKey, sender, await fetchWelcomeProducts(admin));
    const sentAt = new Date().toISOString();
    const { error: saveError } = await admin.from('welcome_coupons').update({ email_sent_at: sentAt }).eq('id', coupon.id);
    if (saveError) throw new Error('Unable to record email delivery.');
    return json({ coupon: { ...coupon, email_sent_at: sentAt } });
  } catch (error) {
    console.error('Welcome coupon email failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Unable to confirm coupon email delivery. Retry later; your coupon is not lost.' }, 502);
  }
});
