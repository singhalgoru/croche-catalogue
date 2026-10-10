import { useEffect, useRef, useState } from 'react';
import type { Cart } from '../types/cart';
import { createCheckoutOrder, loadRazorpay, verifyCheckoutPayment, readCheckoutRecovery, saveCheckoutRecovery, fetchLiveCheckoutStatus } from '../services/checkout';
import type { PaymentResponse } from '../services/checkout';
import { formatINR } from '../utils/currency';

interface Props { cart: Cart; disabled: boolean; live?: boolean }

export default function RazorpayCheckout({ cart, disabled, live = false }: Props) {
  const fingerprintForCart = () => JSON.stringify([cart.id, cart.items.map(item => [item.variantId, item.quantity, item.unitPrice]),
    cart.deliveryPinCode, cart.deliveryEstimate, cart.deliveryDetails, cart.welcomeCouponCode,
    cart.deliveryDetails?.name.trim() ?? '', cart.deliveryDetails?.phone ?? '']);
  const [recovery] = useState(() => {
    try {
      const saved = readCheckoutRecovery(cart.id, live);
      if (live && saved.verified && saved.request?.fingerprint !== fingerprintForCart()) {
        return { request: null, pending: null, verified: false, error: false };
      }
      return { ...saved, error: false };
    }
    catch (error) {
      console.error('Unable to restore checkout:', error);
      return { request: null, pending: null, verified: false, error: true };
    }
  });
  const [name, setName] = useState(cart.deliveryDetails?.name ?? '');
  const [phone, setPhone] = useState(cart.deliveryDetails?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(recovery.error
    ? 'Unable to restore checkout. Contact Luvia before paying again.'
    : recovery.verified ? live ? 'Your order is confirmed. View it in My Account. Do not pay again.' : 'Test payment already verified. No real order was placed.'
    : recovery.pending ? 'Payment needs verification. Retry verification; do not pay again.' : '');
  const [pending, setPending] = useState<PaymentResponse | null>(recovery.pending);
  const [verified, setVerified] = useState(recovery.verified);
  const locked = useRef(false);
  const paid = useRef(Boolean(recovery.pending || recovery.verified));
  const request = useRef<{ fingerprint: string; key: string } | null>(recovery.request);
  const [statusRequest, setStatusRequest] = useState(recovery.request?.key ?? null);
  useEffect(() => {
    if (!live || !statusRequest || verified) return;
    let current = true;
    const check = async () => {
      try {
        const result = await fetchLiveCheckoutStatus(statusRequest);
        if (!current || result?.status !== 'paid') return;
        paid.current = true; locked.current = false;
        saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: true }, true);
        setVerified(true); setPending(null); setBusy(false);
        setMessage(`Order confirmed — ${result.reference}. Payment received. Save this reference; signed-in customers can view it in My Account.`);
      } catch (failure) {
        if (current) setMessage(failure instanceof Error ? failure.message : 'Unable to confirm order status. Do not pay again.');
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 5000);
    return () => { current = false; window.clearInterval(timer); };
  }, [live, statusRequest, verified, cart.id]);

  const verify = async (payment: PaymentResponse) => {
    paid.current = true;
    setPending(payment);
    setBusy(true);
    try { saveCheckoutRecovery(cart.id, { request: request.current, pending: payment, verified: false }, live); }
    catch (error) { console.error('Unable to save payment recovery; keep checkout open:', error); }
    try {
      const id = live ? await verifyCheckoutPayment(payment, true) : await verifyCheckoutPayment(payment);
      setVerified(true);
      setPending(null);
      try { saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: true }, live); }
      catch (error) { console.error('Unable to save verified checkout recovery:', error); }
      setMessage(live ? `Order confirmed — ${id}. Payment received. Save this reference; signed-in customers can view the order in My Account.`
        : `Test payment verified (${id}). No real money was charged and no order was placed. Your cart is unchanged.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification failed. Retry verification; do not pay again.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const start = async () => {
    if (locked.current || disabled || paid.current || recovery.error) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      const Constructor = await loadRazorpay();
      const fingerprint = live ? fingerprintForCart() : JSON.stringify([cart.id, cart.items.map(item => [item.variantId, item.quantity, item.unitPrice]),
        cart.deliveryPinCode, cart.deliveryEstimate, cart.deliveryDetails, cart.welcomeCouponCode, name.trim(), phone]);
      if (live && request.current && request.current.fingerprint !== fingerprint) {
        const existing = await fetchLiveCheckoutStatus(request.current.key);
        if (existing) throw new Error(`Cart details changed after checkout ${existing.reference} started. Contact Luvia before another payment.`);
      }
      if (request.current?.fingerprint !== fingerprint) {
        request.current = { fingerprint, key: crypto.randomUUID() };
      }
      saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: false }, live);
      const body = {
        cartId: cart.id, requestKey: request.current.key, customerName: name.trim(), customerPhone: phone,
      };
      const order = live ? await createCheckoutOrder(body, true) : await createCheckoutOrder(body);
      if (live) setStatusRequest(request.current.key);
      setMessage(live ? `Pay ${formatINR(order.amount / 100)} securely with Razorpay.`
        : `Test checkout: ${formatINR(order.amount / 100)}. No real money will be charged.`);
      const checkout = new Constructor({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
        name: 'Luvia Creations', description: live ? `Order ${order.reference}` : `TEST ONLY — ${order.reference}`,
        prefill: { name: live ? cart.deliveryDetails?.name ?? name.trim() : name.trim(), contact: `+91${live ? cart.deliveryDetails?.phone ?? phone : phone}` },
        handler: payment => { void verify(payment); },
        modal: {
          ondismiss: () => {
            if (paid.current) return;
            locked.current = false;
            setBusy(false);
            setMessage(live ? 'Payment window closed. Your order is not confirmed yet. Resume the same checkout when ready.'
              : 'Test checkout closed. No order was placed.');
          },
        },
      });
      checkout.on('payment.failed', response => {
        if (!paid.current) setMessage(response.error?.description || (live
          ? 'Payment failed. Your order is not confirmed. Resume the same checkout or contact Luvia.'
          : 'Test payment failed. Try another test payment method or close checkout.'));
      });
      checkout.open();
    } catch (error) {
      locked.current = false;
      setBusy(false);
      setMessage(error instanceof Error ? error.message : live ? 'Unable to open checkout. Contact Luvia before another payment.' : 'Unable to open test checkout.');
    }
  };
  return (
    <section className="mt-3 rounded-xl border border-cocoa/20 p-3" aria-label={live ? 'Secure online checkout' : 'Razorpay test checkout'}>
      <p className="text-xs text-cocoa/70">{live ? 'Pay securely with Razorpay. Your order is confirmed only after payment verification.'
        : 'Test checkout only — no real money, purchase or dispatch. Shipping remains indicative.'}</p>
      {!verified && !pending && !recovery.error && (
        <form onSubmit={event => { event.preventDefault(); void start(); }} className="mt-2 grid gap-2">
          {!live && <><label className="text-xs text-cocoa">
            Name
            <input required maxLength={80} value={name} disabled={busy || disabled}
              onChange={event => setName(event.target.value)} autoComplete="name"
              className="mt-1 w-full rounded border border-cocoa/20 bg-white p-2" />
          </label>
          <label className="text-xs text-cocoa">
            Indian mobile number
            <input required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10}
              value={phone} disabled={busy || disabled} onChange={event => setPhone(event.target.value)}
              autoComplete="tel-national" className="mt-1 w-full rounded border border-cocoa/20 bg-white p-2" />
          </label></>}
          <button type="submit" disabled={busy || disabled}
            className="rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? live ? 'Payment in progress…' : 'Test checkout in progress…' : live ? 'Pay securely with Razorpay' : 'Try Razorpay test checkout'}
          </button>
        </form>
      )}
      {pending && <button type="button" disabled={busy} onClick={() => { void verify(pending); }}
        className="mt-2 rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Verifying…' : 'Retry payment verification'}
      </button>}
      {message && <p role="status" className="mt-2 break-words text-xs text-cocoa">{message}</p>}
    </section>
  );
}
