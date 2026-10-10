import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json, paymentConfig, validSignature } from '../_shared/razorpay.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Cart authentication is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Your cart session has expired.' }, 401);
  const rawBody = await request.text();
  if (rawBody.length > 8192) return json({ error: 'The request body is too large.' }, 413);
  let body: { razorpay_order_id?: unknown; razorpay_payment_id?: unknown; razorpay_signature?: unknown };
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body.razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id)
    || typeof body.razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id)
    || typeof body.razorpay_signature !== 'string') {
    return json({ error: 'Payment ID, order ID and signature are required.' }, 400);
  }
  try {
    const { sdk, secret } = paymentConfig();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: blocked, error: blockError } = await admin.from('cart_session_blocks')
      .select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (blockError) throw new Error('Unable to check session access.');
    if (blocked) return json({ error: 'This cart session has been blocked.' }, 403);
    const { data: saved, error } = await admin.from('payment_orders')
      .select('id,total_paise,currency,status,razorpay_order_id,razorpay_payment_id')
      .eq('razorpay_order_id', body.razorpay_order_id).eq('created_by', auth.user.id)
      .eq('is_test_checkout', true).maybeSingle();
    if (error) throw new Error('Unable to read payment order.');
    if (!saved || !await validSignature(saved.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, secret)) {
      return json({ error: 'Payment signature verification failed.' }, 400);
    }
    if (saved.status === 'test_verified') {
      return saved.razorpay_payment_id === body.razorpay_payment_id
        ? json({ success: true, test_mode: true, payment_id: saved.razorpay_payment_id })
        : json({ error: 'This order already has a different verified payment.' }, 400);
    }
    const payment = await sdk.payments.fetch(body.razorpay_payment_id);
    if (payment.id !== body.razorpay_payment_id || payment.order_id !== saved.razorpay_order_id || Number(payment.amount) !== saved.total_paise
      || payment.currency !== saved.currency || payment.status !== 'captured') {
      return json({ error: 'Payment is not captured for the expected order and amount. Retry verification later; do not pay again.' }, 409);
    }
    const { error: saveError } = await admin.rpc('verify_test_checkout', {
      order_id: saved.id, owner_id: auth.user.id, payment_id: payment.id,
    });
    if (saveError) throw new Error('Unable to persist payment verification. Retry verification; do not pay again.');
    return json({ success: true, test_mode: true, payment_id: payment.id });
  } catch (error) {
    console.error('Razorpay verification failed:', error instanceof Error ? error.message : 'Provider error');
    return json({ error: 'Payment verification is unavailable. Retry verification; do not pay again.' }, 500);
  }
});
