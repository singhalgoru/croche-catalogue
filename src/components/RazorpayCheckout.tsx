import { useRef, useState } from 'react';
import type { Cart } from '../types/cart';
import { createCheckoutOrder, loadRazorpay, verifyCheckoutPayment, readCheckoutRecovery, saveCheckoutRecovery } from '../services/checkout';
import type { PaymentResponse } from '../services/checkout';
import { formatINR } from '../utils/currency';

interface Props { cart: Cart; disabled: boolean }

export default function RazorpayCheckout({ cart, disabled }: Props) {
  const [recovery] = useState(() => {
    try { return { ...readCheckoutRecovery(cart.id), error: false }; }
    catch (error) {
      console.error('Unable to restore checkout:', error);
      return { request: null, pending: null, verified: false, error: true };
    }
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(recovery.error
    ? 'Unable to restore checkout. Contact Luvia before paying again.'
    : recovery.verified ? 'Test payment already verified. No real order was placed.'
    : recovery.pending ? 'Payment needs verification. Retry verification; do not pay again.' : '');
  const [pending, setPending] = useState<PaymentResponse | null>(recovery.pending);
  const [verified, setVerified] = useState(recovery.verified);
  const locked = useRef(false);
  const paid = useRef(Boolean(recovery.pending || recovery.verified));
  const request = useRef<{ fingerprint: string; key: string } | null>(recovery.request);

  const verify = async (payment: PaymentResponse) => {
    paid.current = true;
    setPending(payment);
    setBusy(true);
    try { saveCheckoutRecovery(cart.id, { request: request.current, pending: payment, verified: false }); }
    catch (error) { console.error('Unable to save payment recovery; keep checkout open:', error); }
    try {
      const id = await verifyCheckoutPayment(payment);
      setVerified(true);
      setPending(null);
      try { saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: true }); }
      catch (error) { console.error('Unable to save verified checkout recovery:', error); }
      setMessage(`Test payment verified (${id}). No real money was charged and no order was placed. Your cart is unchanged.`);
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
      const fingerprint = JSON.stringify([cart.id, cart.items.map(item => [item.variantId, item.quantity, item.unitPrice]),
        cart.deliveryPinCode, cart.deliveryEstimate, name.trim(), phone]);
      if (request.current?.fingerprint !== fingerprint) {
        request.current = { fingerprint, key: crypto.randomUUID() };
      }
      saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: false });
      const order = await createCheckoutOrder({
        cartId: cart.id, requestKey: request.current.key, customerName: name.trim(), customerPhone: phone,
      });
      setMessage(`Test checkout: ${formatINR(order.amount / 100)}. No real money will be charged.`);
      const checkout = new Constructor({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
        name: 'Luvia Creations', description: `TEST ONLY — ${order.reference}`,
        prefill: { name: name.trim(), contact: `+91${phone}` },
        handler: payment => { void verify(payment); },
        modal: {
          ondismiss: () => {
            if (paid.current) return;
            locked.current = false;
            setBusy(false);
            setMessage('Test checkout closed. No order was placed.');
          },
        },
      });
      checkout.on('payment.failed', response => {
        if (!paid.current) setMessage(response.error?.description || 'Test payment failed. Try another test payment method or close checkout.');
      });
      checkout.open();
    } catch (error) {
      locked.current = false;
      setBusy(false);
      setMessage(error instanceof Error ? error.message : 'Unable to open test checkout.');
    }
  };
  return (
    <section className="mt-3 rounded-xl border border-cocoa/20 p-3" aria-label="Razorpay test checkout">
      <p className="text-xs text-cocoa/70">Test checkout only — no real money, purchase or dispatch. Shipping remains indicative.</p>
      {!verified && !pending && !recovery.error && (
        <form onSubmit={event => { event.preventDefault(); void start(); }} className="mt-2 grid gap-2">
          <label className="text-xs text-cocoa">
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
          </label>
          <button type="submit" disabled={busy || disabled}
            className="rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Test checkout in progress…' : 'Try Razorpay test checkout'}
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
