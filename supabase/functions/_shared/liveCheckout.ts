import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Razorpay from 'npm:razorpay@2.9.8';
import { cors, json, uuid, validSignature } from './razorpay.ts';

function liveConfig() {
  const keyId = Deno.env.get('RAZORPAY_LIVE_KEY_ID');
  const secret = Deno.env.get('RAZORPAY_LIVE_KEY_SECRET');
  if (!keyId?.startsWith('rzp_live_') || !secret || !Deno.env.get('RAZORPAY_WEBHOOK_SECRET')) {
    throw new Error('Live checkout requires live Razorpay credentials and a configured webhook.');
  }
  return { keyId, secret, sdk: new Razorpay({ key_id: keyId, key_secret: secret }) };
}

export async function handleLiveCheckout(request: Request, action: 'create' | 'verify') {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Cart authentication is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: 'Your cart session expired. Please sign in again.' }, 401);
  const raw = await request.text();
  if (raw.length > 8192) return json({ error: 'Request body is too large.' }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request body.' }, 400);
  try {
    const { sdk, keyId, secret } = liveConfig();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    if (action === 'create') {
      if (!uuid(body.cartId) || !uuid(body.requestKey)) return json({ error: 'A cart and checkout request key are required.' }, 400);
      let previousProviderId: string | undefined;
      if (body.previousRequestKey !== undefined) {
        if (!uuid(body.previousRequestKey) || body.previousRequestKey === body.requestKey) return json({ error: 'Invalid previous checkout request.' }, 400);
        const { data: previous, error: readError } = await admin.from('payment_orders')
          .select('razorpay_order_id,status,razorpay_payment_id')
          .eq('request_key', body.previousRequestKey).eq('cart_id', body.cartId)
          .eq('customer_user_id', auth.user.id).eq('is_live_checkout', true).maybeSingle();
        if (readError) throw new Error(`Unable to inspect previous checkout: ${readError.message}`);
        if (!previous?.razorpay_order_id || !['link_created','cancelled','expired'].includes(previous.status) || previous.razorpay_payment_id) {
          return json({ error: 'Previous checkout needs verification. Contact Luvia; do not pay again.' }, 409);
        }
        const providerOrder = await sdk.orders.fetch(previous.razorpay_order_id);
        const payments = await sdk.orders.fetchPayments(previous.razorpay_order_id);
        if (providerOrder.id !== previous.razorpay_order_id || providerOrder.status !== 'created'
          || Number(providerOrder.amount_paid) !== 0 || providerOrder.attempts !== 0
          || payments.count !== 0 || !Array.isArray(payments.items) || payments.items.length !== 0) {
          return json({ error: 'A payment was attempted on the earlier checkout. Verify it before another payment; contact Luvia.' }, 409);
        }
        previousProviderId = previous.razorpay_order_id;
      }
      const { data: order, error } = await admin.rpc(previousProviderId ? 'replace_unattempted_live_checkout' : 'prepare_live_checkout', {
        target_cart_id: body.cartId, owner_id: auth.user.id, request_id: body.requestKey,
        ...(previousProviderId ? { previous_request_id: body.previousRequestKey, expected_provider_order_id: previousProviderId } : {}),
      });
      if (error) return json({ error: error.message }, 400);
      if (!order || !Number.isSafeInteger(order.total_paise) || order.total_paise < 100) throw new Error('Invalid prepared order amount.');
      if (order.status === 'paid') return json({ error: `Order ${order.reference} is already paid. Do not pay again.` }, 409);
      if (order.status !== 'creating_link' && order.status !== 'link_created') {
        return json({ error: `Order ${order.reference} needs review. Contact Luvia; do not pay again.` }, 409);
      }
      if (new Date(order.expires_at).getTime() <= Date.now()) return json({ error: 'Checkout expired. Contact Luvia before trying another payment.' }, 409);
      if (order.status === 'creating_link') {
        if (order.provider_claimed_at) return json({ error: `Order ${order.reference} needs review. Contact Luvia before another payment.` }, 409);
        // A claim is never released after an ambiguous provider failure.
        const { data: claimed, error: claimError } = await admin.from('payment_orders')
          .update({ provider_claimed_at: new Date().toISOString() }).eq('id', order.id).eq('status', 'creating_link')
          .is('provider_claimed_at', null)
          .select('id').maybeSingle();
        if (claimError) throw new Error(`Unable to claim checkout: ${claimError.message}`);
        if (!claimed) return json({ error: 'Checkout creation is already in progress. Wait before retrying.' }, 409);
        const created = await sdk.orders.create({ amount: order.total_paise, currency: 'INR', receipt: order.reference });
        if (!/^order_[A-Za-z0-9]+$/.test(created.id) || Number(created.amount) !== order.total_paise || created.currency !== 'INR') {
          throw new Error('Unexpected Razorpay order response.');
        }
        const { error: saveError } = await admin.from('payment_orders').update({
          status: 'link_created', razorpay_order_id: created.id,
        }).eq('id', order.id).eq('status', 'creating_link');
        if (saveError) throw new Error(`Unable to save provider order: ${saveError.message}`);
        order.razorpay_order_id = created.id;
      }
      return json({ order_id: order.razorpay_order_id, amount: order.total_paise, currency: 'INR',
        key_id: keyId, test_mode: false, reference: order.reference });
    }
    if (typeof body.razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id)
      || typeof body.razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id)
      || typeof body.razorpay_signature !== 'string') return json({ error: 'Valid payment details are required.' }, 400);
    const { data: order, error } = await admin.from('payment_orders')
      .select('id,total_paise,currency,razorpay_order_id,reference')
      .eq('razorpay_order_id', body.razorpay_order_id).eq('customer_user_id', auth.user.id)
      .eq('is_live_checkout', true).maybeSingle();
    if (error) throw new Error(`Unable to read order: ${error.message}`);
    if (!order || !await validSignature(order.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, secret)) {
      return json({ error: 'Payment verification failed. Contact Luvia; do not pay again.' }, 400);
    }
    const payment = await sdk.payments.fetch(body.razorpay_payment_id);
    if (payment.id !== body.razorpay_payment_id || payment.order_id !== order.razorpay_order_id
      || Number(payment.amount) !== order.total_paise || payment.currency !== order.currency || payment.status !== 'captured') {
      return json({ error: 'Payment is not captured for this order. Retry verification later; do not pay again.' }, 409);
    }
    const { data: result, error: settleError } = await admin.rpc('settle_live_checkout', {
      p_order_id: order.id, payment_id: payment.id, amount_paise: order.total_paise, payment_currency: order.currency,
    });
    if (settleError) throw new Error(`Unable to settle order: ${settleError.message}`);
    if (result?.status !== 'paid') return json({ error: `Payment received for ${order.reference}, but the order needs review. Contact Luvia; do not pay again.` }, 409);
    return json({ success: true, test_mode: false, payment_id: payment.id, reference: order.reference });
  } catch (error) {
    console.error(`Live checkout ${action} failed:`, error instanceof Error ? error.message : 'Provider error');
    return json({ error: action === 'verify'
      ? 'Payment verification is unavailable. Retry verification; do not pay again.'
      : 'Unable to create your payment order. Contact Luvia before trying another payment.' }, 503);
  }
}
