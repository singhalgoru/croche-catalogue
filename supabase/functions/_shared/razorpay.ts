import Razorpay from 'npm:razorpay@2.9.8';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function paymentConfig() {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !secret) throw new Error('Razorpay is not configured.');
  // Live payments need fulfilment, inventory reservations and webhook handling first.
  if (!keyId.startsWith('rzp_test_')) throw new Error('Only Razorpay test mode is enabled.');
  return { keyId, secret, sdk: new Razorpay({ key_id: keyId, key_secret: secret }) };
}

export async function validSignature(orderId: string, paymentId: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, value => parseInt(value, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${orderId}|${paymentId}`));
}
