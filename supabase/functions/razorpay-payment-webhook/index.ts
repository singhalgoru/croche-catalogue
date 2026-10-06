import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const verifySignature = async (body: string, suppliedSignature: string, secret: string) => {
  if (!/^[0-9a-f]{64}$/i.test(suppliedSignature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const supplied = new Uint8Array(suppliedSignature.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  if (digest.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) difference |= digest[index] ^ supplied[index];
  return difference === 0;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Razorpay webhook environment is incomplete.');
    return jsonResponse({ error: 'Webhook is not configured.' }, 503);
  }
  if (!signature || !eventId || !/^[A-Za-z0-9._:-]{1,200}$/.test(eventId)) {
    return jsonResponse({ error: 'Webhook signature or event ID is missing or invalid.' }, 401);
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_048_576) return jsonResponse({ error: 'Webhook body is too large.' }, 413);
  if (!await verifySignature(rawBody, signature, webhookSecret)) {
    return jsonResponse({ error: 'Webhook signature is invalid.' }, 401);
  }

  let payload: {
    event?: unknown;
    payload?: {
      payment_link?: { entity?: { id?: unknown; amount?: unknown } };
      payment?: { entity?: { id?: unknown } };
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Webhook body is invalid JSON.' }, 400);
  }

  if (typeof payload.event !== 'string'
    || !['payment_link.paid', 'payment_link.expired', 'payment_link.cancelled'].includes(payload.event)) {
    return jsonResponse({ received: true, ignored: true });
  }

  const link = payload.payload?.payment_link?.entity;
  const payment = payload.payload?.payment?.entity as { id?: unknown; amount?: unknown } | undefined;
  if (typeof link?.id !== 'string' || typeof link.amount !== 'number' || !Number.isSafeInteger(link.amount)) {
    return jsonResponse({ error: 'Webhook payment-link details are invalid.' }, 400);
  }
  if (payload.event === 'payment_link.paid'
    && (typeof payment?.id !== 'string' || typeof payment.amount !== 'number' || !Number.isSafeInteger(payment.amount))) {
    return jsonResponse({ error: 'Webhook payment details are invalid.' }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('record_razorpay_payment_event', {
    p_event_id: eventId,
    p_event_name: payload.event,
    p_link_id: link.id,
    p_payment_id: typeof payment?.id === 'string' ? payment.id : null,
    p_amount_paise: payload.event === 'payment_link.paid' ? payment!.amount : link.amount,
  });
  if (error) {
    console.error('Unable to process Razorpay webhook event:', error.message);
    return jsonResponse({ error: 'Unable to process payment event.' }, 500);
  }
  if (!data || typeof data !== 'object') {
    console.error('Razorpay webhook processor returned an invalid result.');
    return jsonResponse({ error: 'Unable to process payment event.' }, 500);
  }
  if ('reason' in data && data.reason === 'unknown_payment_link') {
    console.error('Razorpay webhook references an unknown payment link; returning a retryable response.');
    return jsonResponse({ error: 'Payment link is not registered yet.' }, 500);
  }
  return jsonResponse({ received: true, ...data });
});
