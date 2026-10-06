import { useState } from 'react';
import type { Cart } from '../types/cart';
import { normalizeDeliveryPin } from '../utils/deliveryPin';

export default function CartDeliveryPin({ cart, busy, onSave }: {
  cart: Cart; busy: boolean; onSave: (value: string) => Promise<Cart | null>;
}) {
  const [draft, setDraft] = useState(cart.deliveryPinCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const showEditor = !cart.deliveryPinCode || editing;
  const save = async (value: string) => {
    setError(null);
    setMessage(null);
    try {
      normalizeDeliveryPin(value);
      setSaving(true);
      const saved = await onSave(value);
      if (!saved) {
        setError('Unable to save your delivery PIN code. Please retry.');
        return;
      }
      setDraft(saved.deliveryPinCode ?? '');
      setEditing(false);
      setMessage(saved.deliveryPinCode ? 'Delivery PIN code saved.' : 'Delivery PIN code cleared.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save your delivery PIN code.');
    } finally {
      setSaving(false);
    }
  };
  return <form onSubmit={event => { event.preventDefault(); void save(draft); }}
    className="rounded-xl border border-mustard/40 bg-mustard/10 p-3 text-sm">
    {showEditor ? <>
      <label htmlFor="cart-delivery-pin" className="font-semibold">Delivery PIN code (optional)</label>
      <div className="mt-2 flex gap-2">
        <input id="cart-delivery-pin" value={draft} onChange={event => { setDraft(event.target.value); setMessage(null); setError(null); }}
          type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} disabled={busy || saving}
          aria-describedby="cart-delivery-pin-help" aria-invalid={Boolean(error)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-mustard px-3" />
        <button disabled={busy || saving} className="min-h-11 shrink-0 rounded-full bg-cocoa px-4 font-semibold text-cream disabled:opacity-50">{saving ? 'Saving…' : 'Save PIN'}</button>
        {cart.deliveryPinCode && <button type="button" disabled={busy || saving} onClick={() => { setDraft(cart.deliveryPinCode ?? ''); setEditing(false); setError(null); }}
          className="min-h-11 shrink-0 underline disabled:opacity-50">Cancel</button>}
      </div>
    </> : <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 font-semibold">Delivery PIN: {cart.deliveryPinCode}</p>
      <button type="button" disabled={busy || saving} onClick={() => { setEditing(true); setMessage(null); }}
        className="min-h-11 shrink-0 px-2 underline disabled:opacity-50">Change PIN</button>
      <button type="button" disabled={busy || saving} onClick={() => void save('')}
        className="min-h-11 shrink-0 px-2 underline disabled:opacity-50">Clear PIN</button>
    </div>}
    {cart.deliveryPinLocation && <p className="text-xs text-cocoa/75">Postal area: {cart.deliveryPinLocation.districts.join(', ')} · {cart.deliveryPinLocation.states.join(', ')} · {cart.deliveryPinLocation.country}</p>}
    {cart.deliveryPinCode && !cart.deliveryPinLocation && <p className="text-xs text-cocoa/75">PIN not checked yet. Change and save to verify.</p>}
    <details className="mt-1 text-xs text-cocoa/75">
      <summary className="flex min-h-11 cursor-pointer items-center underline">How we use your PIN</summary>
      <p id="cart-delivery-pin-help">Optional, for shipping enquiries. Only your PIN is sent to Postal PIN Code API to check its postal area, then shared with Luvia and stored with this cart for up to 30 days. This does not verify your address or confirm delivery charges.</p>
    </details>
    {showEditor && draft.trim() !== (cart.deliveryPinCode ?? '') && <p className="mt-1 text-xs">Unsaved PIN changes are not shared.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {message && <p role="status" className="sr-only">{message}</p>}
  </form>;
}
