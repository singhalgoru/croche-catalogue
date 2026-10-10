import { useState } from 'react';
import type { Cart } from '../types/cart';
import { getCartTotals } from '../utils/cartMessage';
import { formatINR } from '../utils/currency';
import { normalizeDeliveryPin } from '../utils/deliveryPin';
import {
  formatDeliveryDays,
  getCurrentDeliveryEstimate,
  getEstimatedShippingCharge,
  isDeliveryEstimateOutdated,
} from '../utils/deliveryEstimate';

export default function CartDeliveryPin({ cart, busy, onSave }: {
  cart: Cart; busy: boolean; onSave: (value: string) => Promise<Cart | null>;
}) {
  const [draft, setDraft] = useState(cart.deliveryPinCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const showEditor = !cart.deliveryPinCode || editing;
  const estimate = getCurrentDeliveryEstimate(cart);
  const deliveryDays = estimate ? formatDeliveryDays(estimate) : null;
  const save = async (value: string) => {
    setError(null);
    setMessage(null);
    try {
      normalizeDeliveryPin(value);
      setSaving(true);
      const saved = await onSave(value);
      if (!saved) {
        setError('Unable to save your delivery pincode. Please retry.');
        return;
      }
      setDraft(saved.deliveryPinCode ?? '');
      setEditing(false);
      setMessage(saved.deliveryPinCode ? 'Delivery pincode saved.' : 'Delivery pincode cleared.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save your delivery pincode.');
    } finally {
      setSaving(false);
    }
  };
  return <form onSubmit={event => { event.preventDefault(); void save(draft); }}
    className="rounded-xl border border-mustard/40 bg-mustard/10 p-3 text-sm">
    {showEditor ? <>
      <label htmlFor="cart-delivery-pin" className="font-semibold">Delivery pincode (optional)</label>
      <div className="mt-2 flex gap-2">
        <input id="cart-delivery-pin" value={draft} onChange={event => { setDraft(event.target.value); setMessage(null); setError(null); }}
          type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} disabled={busy || saving}
          aria-describedby="cart-delivery-pin-help" aria-invalid={Boolean(error)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-mustard px-3" />
        <button disabled={busy || saving} className="min-h-11 shrink-0 rounded-full bg-cocoa px-4 font-semibold text-cream disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        {cart.deliveryPinCode && <button type="button" disabled={busy || saving} onClick={() => { setDraft(cart.deliveryPinCode ?? ''); setEditing(false); setError(null); }}
          className="min-h-11 shrink-0 underline disabled:opacity-50">Cancel</button>}
      </div>
    </> : <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 font-semibold">Delivery pincode: {cart.deliveryPinCode}</p>
      <button type="button" disabled={busy || saving} onClick={() => { setEditing(true); setMessage(null); }}
        className="min-h-11 shrink-0 px-2 underline disabled:opacity-50">Change</button>
      <button type="button" disabled={busy || saving} onClick={() => void save('')}
        className="min-h-11 shrink-0 px-2 underline disabled:opacity-50">Clear</button>
    </div>}
    {cart.deliveryPinLocation && <p className="text-xs text-cocoa/75">Postal area: {cart.deliveryPinLocation.districts.join(', ')} · {cart.deliveryPinLocation.states.join(', ')} · {cart.deliveryPinLocation.country}</p>}
    {cart.deliveryPinCode && !cart.deliveryPinLocation && <p className="text-xs text-cocoa/75">Pincode not checked yet. Change and save to verify.</p>}
    {!showEditor && estimate && <p className="mt-1 font-semibold text-cocoa">
      {getCartTotals(cart).shippingSource === 'free'
        ? 'Shipping is free for this order'
        : `Approx. delivery charge: ${formatINR(getEstimatedShippingCharge(estimate))}`}
      {deliveryDays ? <span className="font-normal"> · usually {deliveryDays}</span> : null}
    </p>}
    {!showEditor && deliveryDays && <p className="mt-1 text-xs text-cocoa/75">
      Estimated courier transit time only; order preparation time is additional. Delivery dates are not guaranteed.
    </p>}
    {!showEditor && isDeliveryEstimateOutdated(cart) && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-cocoa/75">
      Your cart changed since the delivery estimate.
      <button type="button" disabled={busy || saving} onClick={() => void save(cart.deliveryPinCode ?? '')}
        className="min-h-11 underline disabled:opacity-50">Update estimate</button>
    </p>}
    <details className="mt-1 text-xs text-cocoa/75">
      <summary className="flex min-h-11 cursor-pointer items-center underline">How we use your pincode</summary>
      <p id="cart-delivery-pin-help">Optional, for shipping enquiries. Only your pincode is sent to Postal PIN Code API to check its postal area and to our courier partner Shiprocket for an approximate delivery charge, then shared with Luvia and stored with this cart for up to 30 days. This does not verify your address; Luvia confirms the final delivery charge.</p>
    </details>
    {showEditor && draft.trim() !== (cart.deliveryPinCode ?? '') && <p className="mt-1 text-xs">Unsaved pincode changes are not shared.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {message && <p role="status" className="sr-only">{message}</p>}
  </form>;
}
