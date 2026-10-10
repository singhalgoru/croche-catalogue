import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `welcome-coupon-${coupon.id}`,
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        from: sender, to: [coupon.email], subject: 'Your Luvia first-order welcome coupon',
        text: [
          'Welcome to Luvia Creations!',
          `Your personal coupon: ${coupon.code}`,
          `${coupon.percent}% off your first order, up to ₹${coupon.max_discount_rupees}.`,
          `Minimum items subtotal: ₹${coupon.minimum_subtotal_rupees}. Shipping is excluded.`,
          `Valid until ${new Date(coupon.expires_at).toISOString().slice(0, 10)}.`,
          'Use it from your verified account when sending your order request. Availability and final total require confirmation.',
          'One coupon per verified email, one use only. Cannot be combined with other offers.',
          'https://luviacreations.com/',
        ].join('\n'),
      }),
    });
    if (!response.ok) {
      console.error('Welcome coupon email provider failed:', response.status);
      return json({ error: 'Your coupon email could not be sent. Please retry later.' }, 502);
    }
    const accepted = await response.json();
    if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid email provider confirmation.');
    const sentAt = new Date().toISOString();
    const { error: saveError } = await admin.from('welcome_coupons').update({ email_sent_at: sentAt }).eq('id', coupon.id);
    if (saveError) throw new Error('Unable to record email delivery.');
    return json({ coupon: { ...coupon, email_sent_at: sentAt } });
  } catch (error) {
    console.error('Welcome coupon email failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Unable to confirm coupon email delivery. Retry later; your coupon is not lost.' }, 502);
  }
});
