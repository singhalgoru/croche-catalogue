import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json, paymentConfig, uuid } from '../_shared/razorpay.ts';

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
  if (authError || !auth.user) return json({ error: 'Your cart session has expired. Please refresh.' }, 401);
  const rawBody = await request.text();
  if (rawBody.length > 8192) return json({ error: 'The request body is too large.' }, 413);
  let body: { cartId?: unknown; requestKey?: unknown; customerName?: unknown; customerPhone?: unknown };
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || !uuid(body.cartId) || !uuid(body.requestKey)
    || typeof body.customerName !== 'string' || !body.customerName.trim() || body.customerName.trim().length > 80
    || typeof body.customerPhone !== 'string' || !/^[6-9]\d{9}$/.test(body.customerPhone)) {
    return json({ error: 'A cart, request key, name and valid Indian mobile number are required.' }, 400);
  }
  try {
    const { sdk, keyId } = paymentConfig();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: payment, error } = await admin.rpc('prepare_checkout_payment', {
      target_cart_id: body.cartId, owner_id: auth.user.id, request_id: body.requestKey,
      customer_name: body.customerName.trim(), customer_phone: `+91${body.customerPhone}`,
    });
    if (error) return json({ error: error.message }, 400);
    if (!payment || !Number.isSafeInteger(payment.total_paise) || payment.total_paise < 100) {
      throw new Error('Unable to prepare the payment amount.');
    }
    const response = (orderId: string) => json({
      order_id: orderId, amount: payment.total_paise, currency: 'INR', key_id: keyId,
      test_mode: true, reference: payment.reference,
    });
    if (payment.status === 'test_verified') return json({ error: 'This test checkout is already verified. No need to pay again.' }, 409);
    if (payment.status === 'checkout_created' && payment.razorpay_order_id) return response(payment.razorpay_order_id);
    // Claim once before contacting Razorpay; ambiguous failures remain held for review.
    if (payment.status !== 'creating_checkout') {
      return json({ error: 'This checkout needs review. Contact Luvia with the cart reference; do not pay again.' }, 409);
    }
    const { data: claimed, error: claimError } = await admin.from('payment_orders')
      .update({ status: 'checkout_claimed', updated_at: new Date().toISOString() }).eq('id', payment.id)
      .eq('status', 'creating_checkout').select('id').maybeSingle();
    if (claimError) throw new Error('Unable to claim checkout.');
    if (!claimed) return json({ error: 'Checkout creation is already in progress. Please wait and retry.' }, 409);
    const order = await sdk.orders.create({ amount: payment.total_paise, currency: 'INR', receipt: payment.id });
    if (!/^order_[A-Za-z0-9]+$/.test(order.id) || Number(order.amount) !== payment.total_paise || order.currency !== 'INR') {
      throw new Error('Invalid provider order response.');
    }
    const { error: saveError } = await admin.from('payment_orders')
      .update({ razorpay_order_id: order.id, status: 'checkout_created' }).eq('id', payment.id);
    if (saveError) throw new Error('Unable to persist the payment order.');
    return response(order.id);
  } catch (error) {
    console.error('Razorpay order creation failed:', error instanceof Error ? error.message : 'Provider error');
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401 ? 401 : 500;
    return json({ error: 'Unable to create a test payment order. Contact Luvia with the cart reference before trying another payment.' }, status);
  }
});
