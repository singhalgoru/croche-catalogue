import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

interface CreateLinkRequest {
  cartId?: unknown;
  requestKey?: unknown;
  customerName?: unknown;
  customerContact?: unknown;
  customerEmail?: unknown;
  shippingRupees?: unknown;
}

const normalizePhone = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
};

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Admin authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase payment-link configuration is incomplete.' }, 500);
  }
  if (!razorpayKeyId || !razorpayKeySecret) {
    return jsonResponse({ error: 'Razorpay is not configured. Add test-mode credentials before creating payment links.' }, 503);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Admin authentication has expired. Please sign in again.' }, 401);
  const { data: isAdmin, error: adminError } = await authClient.rpc('is_catalogue_admin');
  if (adminError) {
    console.error('Unable to verify payment-link admin access:', adminError.message);
    return jsonResponse({ error: 'Unable to verify admin access.' }, 500);
  }
  if (!isAdmin) return jsonResponse({ error: 'Only catalogue admins can issue payment links.' }, 403);

  const rawBody = await request.text();
  if (rawBody.length > 8_192) return jsonResponse({ error: 'The request body is too large.' }, 413);
  let body: CreateLinkRequest;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'The request body must be valid JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'The request body must be a JSON object.' }, 400);
  }

  const contact = normalizePhone(body.customerContact);
  const email = typeof body.customerEmail === 'string' && body.customerEmail.trim()
    ? body.customerEmail.trim()
    : null;
  const name = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  if (!validUuid(body.cartId) || !validUuid(body.requestKey)
    || !name || name.length > 80 || !contact
    || (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    || typeof body.shippingRupees !== 'number' || !Number.isSafeInteger(body.shippingRupees)
    || body.shippingRupees < 0 || body.shippingRupees > 1_000_000) {
    return jsonResponse({
      error: 'Provide a cart, request key, customer name, valid Indian mobile, optional valid email, and shipping amount in whole rupees.',
    }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: order, error: prepareError } = await authClient.rpc('prepare_payment_link_order', {
    p_cart_id: body.cartId,
    p_request_key: body.requestKey,
    p_customer_name: name,
    p_customer_contact: contact,
    p_customer_email: email,
    p_shipping_paise: body.shippingRupees * 100,
  });
  if (prepareError) {
    const message = prepareError.message;
    const conflict = /already has a (?:paid order|pending payment link)/i.test(message);
    const expected = conflict || /Only catalogue admins|idempotency key|valid Indian mobile|valid email|Shipping must|cart is no longer|at least one item|no longer published|price-on-request|no valid price|out of stock|not enough available stock|outside the supported range/i.test(message);
    return jsonResponse({ error: expected ? message : 'Unable to prepare the confirmed order.' }, conflict ? 409 : expected ? 422 : 500);
  }
  if (!order || typeof order !== 'object' || typeof order.id !== 'string'
    || typeof order.reference !== 'string' || typeof order.status !== 'string') {
    console.error('Payment-order preparation returned an invalid response.');
    return jsonResponse({ error: 'Unable to prepare the confirmed order.' }, 500);
  }
  if (order.status === 'link_created' && typeof order.payment_url === 'string') {
    return jsonResponse({
      orderReference: order.reference,
      paymentUrl: order.payment_url,
      expiresAt: order.expires_at,
      reused: true,
    });
  }
  if (order.status !== 'creating_link' || order.reused === true) {
    return jsonResponse({
      error: `This request is already ${order.status}. Do not create another link; check the Razorpay dashboard using reference ${order.reference}.`,
      orderReference: order.reference,
    }, 409);
  }

  const expiration = Math.floor(new Date(order.expires_at).getTime() / 1000);
  if (!Number.isSafeInteger(order.total_paise) || order.total_paise <= 0
    || !Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000)) {
    return jsonResponse({ error: 'The prepared order has an invalid amount or expiry.' }, 500);
  }

  let razorpayResponse: Response;
  try {
    razorpayResponse = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: order.total_paise,
        currency: 'INR',
        accept_partial: false,
        reference_id: order.reference,
        description: `Luvia Creations order ${order.reference}`,
        customer: { name, contact, ...(email ? { email } : {}) },
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: expiration,
        notes: { order_id: order.id },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.error('Razorpay payment-link request failed:', error instanceof Error ? error.name : 'Unknown error');
    return jsonResponse({
      error: 'Razorpay did not confirm whether the link was created. Check Razorpay using the order reference before retrying.',
      orderReference: order.reference,
    }, 502);
  }

  if (!razorpayResponse.ok) {
    console.error('Razorpay payment-link request returned HTTP', razorpayResponse.status);
    if (razorpayResponse.status < 500) {
      const { error: failError } = await adminClient.from('payment_orders')
        .update({ status: 'link_failed', updated_at: new Date().toISOString() }).eq('id', order.id);
      if (failError) console.error('Unable to mark rejected Razorpay link as failed:', failError.message);
    }
    return jsonResponse({
      error: razorpayResponse.status < 500
        ? 'Razorpay rejected the payment-link request. You may retry with a new request key after fixing the issue.'
        : 'Razorpay did not confirm whether the link was created. Check Razorpay using the order reference before retrying.',
      orderReference: order.reference,
    }, 502);
  }

  let paymentLink: { id?: unknown; short_url?: unknown };
  try {
    paymentLink = await razorpayResponse.json();
  } catch {
    console.error('Razorpay returned an invalid payment-link response.');
    return jsonResponse({
      error: 'Razorpay returned an invalid response. Check Razorpay using the order reference before retrying.',
      orderReference: order.reference,
    }, 502);
  }
  if (typeof paymentLink.id !== 'string' || typeof paymentLink.short_url !== 'string'
    || !/^https:\/\/rzp\.io\//.test(paymentLink.short_url)) {
    console.error('Razorpay payment-link response did not include a valid hosted link.');
    return jsonResponse({
      error: 'Razorpay returned an invalid payment link. Check Razorpay using the order reference.',
      orderReference: order.reference,
    }, 502);
  }

  const { error: saveError } = await adminClient.from('payment_orders').update({
    status: 'link_created',
    razorpay_link_id: paymentLink.id,
    payment_url: paymentLink.short_url,
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (saveError) {
    console.error('Unable to save Razorpay link to the payment order:', saveError.message);
    return jsonResponse({
      error: 'Razorpay created the link, but saving it failed. Do not create another link; check Razorpay using the order reference.',
      orderReference: order.reference,
    }, 500);
  }

  return jsonResponse({
    orderReference: order.reference,
    paymentUrl: paymentLink.short_url,
    expiresAt: order.expires_at,
    reused: false,
  });
});
