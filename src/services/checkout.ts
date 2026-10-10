import { loadSupabase } from '../lib/supabaseConfig';

export interface PaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
export interface CheckoutOrder {
  order_id: string;
  amount: number;
  currency: 'INR';
  key_id: string;
  test_mode: true;
  reference: string;
}
export interface CheckoutOptions {
  key: string;
  amount: number;
  currency: 'INR';
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; contact: string };
  handler: (response: PaymentResponse) => void;
  modal: { ondismiss: () => void };
}
export interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void;
}
export type RazorpayConstructor = new (options: CheckoutOptions) => RazorpayInstance;
declare global {
  interface Window { Razorpay?: RazorpayConstructor }
}

let scriptPromise: Promise<RazorpayConstructor> | null = null;
export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(new Error('Unable to load Razorpay. Check your connection and retry.'));
    };
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      if (!window.Razorpay) { fail(); return; }
      resolve(window.Razorpay);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function invoke(name: string, body: Record<string, string>): Promise<unknown> {
  const client = await loadSupabase();
  if (!client) throw new Error('Checkout requires an online cart.');
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    if (error.context instanceof Response) {
      const payload: unknown = await error.context.json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        throw new Error(payload.error);
      }
    }
    throw new Error(error.message || 'Unable to contact the payment service.');
  }
  return data;
}
export async function createCheckoutOrder(body: {
  cartId: string; requestKey: string; customerName: string; customerPhone: string;
}): Promise<CheckoutOrder> {
  const data = await invoke('create-order', body);
  if (!data || typeof data !== 'object' || !('order_id' in data) || typeof data.order_id !== 'string'
    || !/^order_[A-Za-z0-9]+$/.test(data.order_id)
    || !('amount' in data) || typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount < 100
    || !('currency' in data) || data.currency !== 'INR'
    || !('key_id' in data) || typeof data.key_id !== 'string' || !data.key_id.startsWith('rzp_test_')
    || !('test_mode' in data) || data.test_mode !== true
    || !('reference' in data) || typeof data.reference !== 'string') {
    throw new Error('The payment service returned an invalid test order.');
  }
  return {
    order_id: data.order_id, amount: data.amount, currency: data.currency,
    key_id: data.key_id, test_mode: data.test_mode, reference: data.reference,
  };
}
export async function verifyCheckoutPayment(payment: PaymentResponse): Promise<string> {
  const data = await invoke('verify-payment', { ...payment });
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true
    || !('test_mode' in data) || data.test_mode !== true
    || !('payment_id' in data) || data.payment_id !== payment.razorpay_payment_id) {
    throw new Error('Payment could not be verified. Retry verification; do not pay again.');
  }
  return payment.razorpay_payment_id;
}

export interface CheckoutRecovery {
  request: { fingerprint: string; key: string } | null;
  pending: PaymentResponse | null;
  verified: boolean;
}
export function readCheckoutRecovery(cartId: string): CheckoutRecovery {
  const stored = sessionStorage.getItem(`luvia-checkout-${cartId}`);
  if (!stored) return { request: null, pending: null, verified: false };
  const value: unknown = JSON.parse(stored);
  if (!value || typeof value !== 'object' || !('verified' in value) || typeof value.verified !== 'boolean'
    || !('request' in value) || !('pending' in value)) throw new Error('Invalid checkout recovery record.');
  const request = value.request;
  const pending = value.pending;
  let parsedRequest: CheckoutRecovery['request'] = null;
  let parsedPending: PaymentResponse | null = null;
  if (request !== null) {
    if (!request || typeof request !== 'object' || !('fingerprint' in request) || typeof request.fingerprint !== 'string'
      || !('key' in request) || typeof request.key !== 'string') throw new Error('Invalid checkout request record.');
    parsedRequest = { fingerprint: request.fingerprint, key: request.key };
  }
  if (pending !== null) {
    if (!pending || typeof pending !== 'object' || !('razorpay_order_id' in pending) || typeof pending.razorpay_order_id !== 'string'
      || !('razorpay_payment_id' in pending) || typeof pending.razorpay_payment_id !== 'string'
      || !('razorpay_signature' in pending) || typeof pending.razorpay_signature !== 'string') throw new Error('Invalid payment recovery record.');
    parsedPending = {
      razorpay_order_id: pending.razorpay_order_id, razorpay_payment_id: pending.razorpay_payment_id,
      razorpay_signature: pending.razorpay_signature,
    };
  }
  return { request: parsedRequest, pending: parsedPending, verified: value.verified };
}
export function saveCheckoutRecovery(cartId: string, value: CheckoutRecovery) {
  sessionStorage.setItem(`luvia-checkout-${cartId}`, JSON.stringify(value));
}
