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
      setMessage(saved.deliveryPinCode ? 'Delivery PIN code saved.' : 'Delivery PIN code cleared.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save your delivery PIN code.');
    } finally {
      setSaving(false);
    }
  };
  return <form onSubmit={event => { event.preventDefault(); void save(draft); }}
    className="rounded-xl border border-mustard/40 bg-mustard/10 p-3 text-sm">
    <label htmlFor="cart-delivery-pin" className="font-semibold">Delivery PIN code (optional)</label>
    <p id="cart-delivery-pin-help" className="mt-1 text-xs text-cocoa/75">Shared with Luvia to help confirm shipping availability and charges. Stored with this cart for up to 30 days; not a verified address or shipping quote.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <input id="cart-delivery-pin" value={draft} onChange={event => { setDraft(event.target.value); setMessage(null); setError(null); }}
        type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} disabled={busy || saving}
        aria-describedby="cart-delivery-pin-help" className="min-h-11 w-28 rounded-lg border border-mustard px-3" />
      <button disabled={busy || saving} className="min-h-11 rounded-full bg-cocoa px-4 font-semibold text-cream disabled:opacity-50">{saving ? 'Saving…' : 'Save PIN'}</button>
      {(cart.deliveryPinCode || draft) && <button type="button" disabled={busy || saving} onClick={() => void save('')}
        className="min-h-11 px-3 underline disabled:opacity-50">Clear PIN</button>}
    </div>
    {draft.trim() !== (cart.deliveryPinCode ?? '') && <p className="mt-2 text-xs">Unsaved PIN changes are not included in enquiries. Save to share them, or continue without saving.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </form>;
}
