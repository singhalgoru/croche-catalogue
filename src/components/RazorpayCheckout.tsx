import { useEffect, useRef, useState } from 'react';
import type { Cart } from '../types/cart';
import { createCheckoutOrder, loadRazorpay, verifyCheckoutPayment, readCheckoutRecovery, saveCheckoutRecovery, fetchLiveCheckoutStatus, fetchLiveCheckoutRecovery } from '../services/checkout';
import type { PaymentResponse } from '../services/checkout';
import { formatINR } from '../utils/currency';
import { trackCartStep, trackEvent } from '../services/analytics';
import { trackVerifiedPurchase } from '../services/purchaseAnalytics';
import { calculateEstimatedDeliveryDate, renderGoogleCustomerReviewsOptIn } from '../services/googleCustomerReviews';
import { getCheckoutSupportWhatsAppLink, getConfirmedOrderWhatsAppLink } from '../utils/whatsapp';

interface Props { cart: Cart; disabled: boolean; live?: boolean; onConfirmed?: (requestId: string | undefined, purchasedCart: Cart) => void; confirmationOnly?: boolean; confirmationRequest?: string }

export default function RazorpayCheckout({ cart, disabled, live = false, onConfirmed, confirmationOnly = false, confirmationRequest }: Props) {
  const fingerprintForCart = () => JSON.stringify([cart.id, cart.items.map(item => [item.variantId, item.quantity, item.unitPrice]),
    cart.deliveryPinCode, cart.deliveryEstimate, cart.deliveryDetails, cart.welcomeCouponCode,
    cart.deliveryDetails?.name.trim() ?? '', cart.deliveryDetails?.phone ?? '']);
  const cartFingerprint = fingerprintForCart();
  const [recovery] = useState(() => {
    try {
      if (live && confirmationOnly && confirmationRequest) {
        return { request: { fingerprint: '', key: confirmationRequest }, pending: null, verified: false, error: false };
      }
      const saved = readCheckoutRecovery(cart.id, live);
      if (live && !confirmationOnly && saved.verified && saved.request?.fingerprint !== cartFingerprint) {
        return { request: null, pending: null, verified: false, error: false };
      }
      return { ...saved, verified: confirmationOnly ? false : saved.verified, error: false };
    }
    catch (error) {
      console.error('Unable to restore checkout:', error);
      return { request: null, pending: null, verified: false, error: true };
    }
  });
  const [name, setName] = useState(cart.deliveryDetails?.name ?? '');
  const [phone, setPhone] = useState(cart.deliveryDetails?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [syncingRecovery, setSyncingRecovery] = useState(live && !confirmationOnly && !recovery.error
    && !recovery.pending && !recovery.verified);
  const [syncError, setSyncError] = useState(false);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [message, setMessage] = useState(recovery.error
    ? 'Unable to restore checkout. Contact Luvia before paying again.'
    : recovery.verified ? live ? 'Your order is confirmed. Signed-in customers can view it in My orders. Do not pay again.' : 'Test payment already verified. No real order was placed.'
    : recovery.pending ? 'Payment needs verification. Retry verification; do not pay again.'
    : confirmationOnly ? recovery.request ? 'Checking your saved order. Do not pay again.'
      : 'No saved payment was found in this browser. If you paid, contact Luvia or check My orders if signed in. Do not pay again.' : '');
  const [pending, setPending] = useState<PaymentResponse | null>(recovery.pending);
  const [verified, setVerified] = useState(recovery.verified);
  const [interruption, setInterruption] = useState<'closed' | 'failed' | 'blocked' | null>(null);
  const paymentFailed = useRef(false);
  const purchaseCart = useRef(cart);
  const confirmedCallback = useRef(onConfirmed);
  useEffect(() => { confirmedCallback.current = onConfirmed; }, [onConfirmed]);
  const locked = useRef(false);
  const paid = useRef(Boolean(recovery.pending || recovery.verified));
  const request = useRef<{ fingerprint: string; key: string; previousRequestKey?: string } | null>(recovery.request);
  const [statusRequest, setStatusRequest] = useState(recovery.request?.key ?? null);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const optInTriggered = useRef(false);
  useEffect(() => {
    if (!live || confirmationOnly || recovery.error || recovery.pending || recovery.verified) {
      setSyncingRecovery(false);
      return;
    }
    setSyncingRecovery(true);
    setSyncError(false);
    let current = true;
    const sync = async () => {
      try {
        const latest = await fetchLiveCheckoutRecovery(cart.id);
        if (!current || paid.current || locked.current) return;
        if (!latest) { setMessage(''); return; }
        if (request.current?.key !== latest.requestKey) {
          request.current = { fingerprint: latest.cartMatches ? cartFingerprint : '', key: latest.requestKey };
        }
        setStatusRequest(latest.requestKey);
        try {
          saveCheckoutRecovery(cart.id, {
            request: request.current, pending: null, verified: latest.status === 'paid',
          }, true);
        } catch (error) {
          console.error('Unable to save synced checkout recovery:', error);
        }
        if (latest.status === 'paid') {
          paid.current = true;
          locked.current = false;
          setConfirmedOrderId(latest.reference);
          setVerified(true);
          setPending(null);
          setInterruption(null);
          setMessage(`Order confirmed — ${latest.reference}. Payment received. Save this reference; signed-in customers can view it in My orders.`);
          return;
        }
        if (latest.status === 'review_required') {
          setInterruption('blocked');
          setMessage(`Checkout ${latest.reference} needs verification. Contact Luvia before paying again.`);
          return;
        }
        setInterruption('closed');
        setMessage(`This cart has a pending payment (${latest.reference}). Resume it here or contact Luvia before paying again.`);
      } catch (error) {
        if (current) {
          console.error('Unable to sync live checkout:', error);
          setSyncError(true);
          setMessage(error instanceof Error ? error.message : 'Unable to check your earlier payment. Please retry before paying.');
        }
      } finally {
        if (current) setSyncingRecovery(false);
      }
    };
    void sync();
    return () => { current = false; };
  }, [cart.id, cartFingerprint, confirmationOnly, live, recovery.error, recovery.pending, recovery.verified, syncAttempt]);
  useEffect(() => {
    if (live && verified) {
      if (statusRequest) void trackVerifiedPurchase(statusRequest);
      confirmedCallback.current?.(statusRequest ?? undefined, purchaseCart.current);
      const email = purchaseCart.current.deliveryDetails?.email?.trim();
      const orderId = confirmedOrderId ?? statusRequest ?? cart.reference;
      if (email && orderId && !optInTriggered.current) {
        optInTriggered.current = true;
        renderGoogleCustomerReviewsOptIn({
          orderId,
          email,
          deliveryCountry: 'IN',
          estimatedDeliveryDate: calculateEstimatedDeliveryDate(
            purchaseCart.current.deliveryEstimate?.maxDays ? Math.max(5, purchaseCart.current.deliveryEstimate.maxDays) : 9,
          ),
          optInStyle: 'CENTER_DIALOG',
        });
      }
    }
  }, [live, verified, statusRequest, confirmedOrderId, cart.reference]);
  useEffect(() => {
    if (!live || !statusRequest || verified) return;
    let current = true;
    const check = async () => {
      try {
        const result = await fetchLiveCheckoutStatus(statusRequest);
        if (!current) return;
        if (result?.status !== 'paid') {
          if (confirmationOnly) setMessage(result
            ? `Payment is not confirmed for ${result.reference}. If money was debited, contact Luvia. Do not pay again.`
            : 'No accessible order was found for this checkout. Contact Luvia if you paid. Do not pay again.');
          return;
        }
        paid.current = true; locked.current = false;
        if (!confirmationRequest) saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: true }, true);
        setConfirmedOrderId(result.reference);
        setVerified(true); setPending(null); setBusy(false);
        setMessage(`Order confirmed — ${result.reference}. Payment received. Save this reference; signed-in customers can view it in My orders.`);
      } catch (failure) {
        if (current) setMessage(failure instanceof Error ? failure.message : 'Unable to confirm order status. Do not pay again.');
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 5000);
    return () => { current = false; window.clearInterval(timer); };
  }, [live, statusRequest, verified, cart.id, confirmationRequest, confirmationOnly]);

  const verify = async (payment: PaymentResponse) => {
    paid.current = true;
    setInterruption(null);
    setMessage('Checking your payment with Razorpay. Please wait; do not pay again.');
    setPending(payment);
    setBusy(true);
    try { saveCheckoutRecovery(cart.id, { request: request.current, pending: payment, verified: false }, live); }
    catch (error) { console.error('Unable to save payment recovery; keep checkout open:', error); }
    try {
      const id = live ? await verifyCheckoutPayment(payment, true) : await verifyCheckoutPayment(payment);
      if (live) setConfirmedOrderId(id);
      setVerified(true);
      setPending(null);
      try { saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: true }, live); }
      catch (error) { console.error('Unable to save verified checkout recovery:', error); }
      setMessage(live ? `Order confirmed — ${id}. Payment received. Save this reference; signed-in customers can view the order in My orders.`
        : `Test payment verified (${id}). No real money was charged and no order was placed. Your cart is unchanged.`);
    } catch (error) {
      if (live) trackEvent('payment_verification_pending', { payment_type: 'Razorpay' });
      setMessage(error instanceof Error ? error.message : 'Verification failed. Retry verification; do not pay again.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const start = async () => {
    if (locked.current || disabled || confirmationOnly || paid.current || recovery.error || syncingRecovery || syncError) return;
    locked.current = true;
    purchaseCart.current = cart;
    setBusy(true);
    setMessage('');
    setInterruption(null);
    paymentFailed.current = false;
    try {
      const Constructor = await loadRazorpay();
      const fingerprint = live ? cartFingerprint : JSON.stringify([cart.id, cart.items.map(item => [item.variantId, item.quantity, item.unitPrice]),
        cart.deliveryPinCode, cart.deliveryEstimate, cart.deliveryDetails, cart.welcomeCouponCode, name.trim(), phone]);
      if (live && request.current) {
        const existing = await fetchLiveCheckoutStatus(request.current.key);
        const needsReplacement = request.current.fingerprint !== fingerprint || existing?.status === 'expired';
        if (needsReplacement && existing && !['link_created','cancelled','expired'].includes(existing.status)) {
          throw new Error(`Checkout ${existing.reference} needs verification. Contact Luvia before another payment.`);
        }
        if (needsReplacement && existing) {
          request.current = { fingerprint, key: crypto.randomUUID(), previousRequestKey: request.current.key };
        } else if (request.current.previousRequestKey) {
          request.current = { ...request.current, fingerprint };
        }
      }
      if (request.current?.fingerprint !== fingerprint) {
        request.current = { fingerprint, key: crypto.randomUUID() };
      }
      saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: false }, live);
      const body = {
        cartId: cart.id, requestKey: request.current.key, customerName: name.trim(), customerPhone: phone,
        ...(request.current.previousRequestKey ? { previousRequestKey: request.current.previousRequestKey } : {}),
      };
      const order = live ? await createCheckoutOrder(body, true) : await createCheckoutOrder(body);
      if (live) trackCartStep('add_payment_info', cart);
      if (live) setStatusRequest(request.current.key);
      if (live && request.current.previousRequestKey) {
        delete request.current.previousRequestKey;
        saveCheckoutRecovery(cart.id, { request: request.current, pending: null, verified: false }, true);
      }
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
            if (live) trackEvent('payment_window_closed', { payment_type: 'Razorpay' });
            locked.current = false;
            setBusy(false);
            if (live) {
              if (!paymentFailed.current) {
                setInterruption('closed');
                setMessage('Payment confirmation has not arrived yet. If you are approving payment in your bank or UPI app, finish there and wait here. Your cart and delivery details are saved. Do not start another payment while one is in progress.');
              }
            } else setMessage('Test checkout closed. No order was placed.');
          },
        },
      });
      checkout.on('payment.failed', response => {
        if (live && !paid.current) trackEvent('payment_failed', { payment_type: 'Razorpay' });
        if (!paid.current) {
          if (live) {
            paymentFailed.current = true;
            setInterruption('failed');
            setMessage(`Your payment could not be completed. Your order is not confirmed yet. Your cart and delivery details are still here.${response.error?.description ? ` Payment provider: ${response.error.description}` : ''}`);
          } else setMessage(response.error?.description || 'Test payment failed. Try another test payment method or close checkout.');
        }
      });
      checkout.open();
    } catch (error) {
      if (live) trackEvent('checkout_error', { checkout_stage: 'opening_payment', payment_type: 'Razorpay' });
      locked.current = false;
      setBusy(false);
      const failureMessage = error instanceof Error ? error.message : live ? 'Unable to open checkout. Contact Luvia before another payment.' : 'Unable to open test checkout.';
      if (live && /pending payment|needs verification|needs review|verify it before|already paid|do not pay again|before another payment|before paying again/i.test(failureMessage)) {
        setInterruption('blocked');
      }
      setMessage(failureMessage);
    }
  };
  const showRecovery = live && interruption !== null && !verified && !pending && !busy;
  return (
    <section className={live && verified
      ? 'mt-3 rounded-xl border border-green-200 bg-green-50 p-4'
      : showRecovery ? 'mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-md'
      : 'mt-3 rounded-xl border border-cocoa/20 p-3'} aria-label={live ? 'Secure online checkout' : 'Razorpay test checkout'}>
      {live && verified && <div>
        <h3 className="font-heading text-xl font-bold text-green-800">Thank you! Your order is confirmed.</h3>
        <p className="mt-2 text-sm text-green-900">Payment received successfully. Do not pay again.</p>
        <p className="mt-2 text-sm text-cocoa">Your order confirmation is sent separately by email. Please check your inbox and Spam folder. Contact orders@luviacreations.com if it does not arrive.</p>
        {confirmedOrderId && <div className="mt-3">
          <a href={getConfirmedOrderWhatsAppLink(cart, confirmedOrderId)} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-green-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa">
            Send order to seller on WhatsApp
          </a>
          <p className="mt-1 text-xs text-cocoa/70">WhatsApp opens with the order summary ready. Review it and tap Send to notify the seller.</p>
        </div>}
      </div>}
      {showRecovery && <div role="status" aria-live="polite" aria-atomic="true">
        {interruption !== 'blocked' && <p className="mb-2 inline-flex rounded-full bg-amber-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cocoa">
          {interruption === 'failed' ? 'Payment incomplete' : 'Awaiting payment confirmation'}
        </p>}
        <h3 className="font-heading text-xl font-bold text-cocoa">
          {interruption === 'blocked' ? 'An earlier payment needs checking.'
            : interruption === 'failed' ? "Payment didn't go through. Let's get you back on track." : 'Waiting for your payment confirmation.'}
        </h3>
        {interruption === 'failed' && <p className="mt-2 text-base font-bold text-cocoa">
          Your handmade favourites are one step away. Complete your payment to make them yours.
        </p>}
        <p className="mt-2 break-words text-sm text-cocoa">{message || 'Your saved checkout is available. Your order is not confirmed yet.'}</p>
        <p className="mt-2 text-sm font-semibold text-cocoa">
          {interruption === 'blocked'
            ? 'We cannot safely start another payment from this checkout. Contact Luvia to check the earlier payment and help you continue. '
            : interruption === 'closed' ? 'Only resume if you have stopped the earlier payment and no money was debited. ' : 'Resume securely and choose your preferred payment method. '}
          If money was debited, contact Luvia before paying again.
        </p>
      </div>}
      {!(live && verified) && !showRecovery && <p className="text-xs text-cocoa/70">{live ? 'Pay securely with Razorpay. Your order is confirmed only after payment verification. Close any earlier payment windows and use only the latest checkout.'
        : 'Test checkout only — no real money, purchase or dispatch. Shipping remains indicative.'}</p>}
      {live && syncingRecovery && <p role="status" className="mt-2 text-xs text-cocoa">Checking for an earlier payment on this cart…</p>}
      {syncError && <button type="button" onClick={() => setSyncAttempt(attempt => attempt + 1)}
        className="mt-2 min-h-11 rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white">
        Retry payment status check
      </button>}
      {!confirmationOnly && !verified && !pending && !recovery.error && interruption !== 'blocked' && (
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
          <button type="submit" disabled={busy || disabled || syncingRecovery || syncError}
            className={showRecovery
              ? 'min-h-12 rounded-full border-2 border-cocoa bg-mustard px-4 py-3 text-base font-bold text-cocoa shadow-sm hover:bg-mustard/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cocoa disabled:opacity-50'
              : 'min-h-11 rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white disabled:opacity-50'}>
            {busy ? live ? 'Payment in progress…' : 'Test checkout in progress…' : live ? showRecovery ? 'Resume secure payment' : 'Proceed to payment' : 'Try Razorpay test checkout'}
          </button>
          {showRecovery && !busy && <p className="text-center text-xs text-cocoa">
            No need to start over. Review your saved details and finish securely.
          </p>}
        </form>
      )}
      {pending && <button type="button" disabled={busy} onClick={() => { void verify(pending); }}
        className="mt-2 rounded-full bg-cocoa px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Verifying…' : 'Retry payment verification'}
      </button>}
      {showRecovery && <a href={getCheckoutSupportWhatsAppLink()} target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-cocoa underline underline-offset-4">
        Get payment help on WhatsApp
      </a>}
      {message && !showRecovery && <p role="status" className={live && verified
        ? 'mt-3 break-words text-sm font-semibold text-green-900'
        : 'mt-2 break-words text-xs text-cocoa'}>{message}</p>}
    </section>
  );
}
