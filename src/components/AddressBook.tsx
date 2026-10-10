import { useCallback, useEffect, useState } from 'react';
import type { DeliveryDetails, SavedAddress } from '../types/customer';
import { deleteCustomerAddress, fetchCustomerAddresses, saveCustomerAddress } from '../services/customer';
import { deliveryAddressText, emptyDeliveryDetails } from '../utils/customer';

interface Props {
  accountEmail: string;
  onDefaultChange?: (details: DeliveryDetails) => void;
}
const fields = [
  ['name', 'Recipient name', 'name', 80, true],
  ['phone', 'Mobile number', 'tel-national', 10, true],
  ['addressLine1', 'House / building and street', 'address-line1', 200, true],
  ['addressLine2', 'Area / landmark (optional)', 'address-line2', 200, false],
  ['city', 'City', 'address-level2', 80, true],
  ['state', 'State', 'address-level1', 80, true],
  ['pincode', 'Pincode', 'postal-code', 6, true],
] as const;

export default function AddressBook({ accountEmail, onDefaultChange }: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; details: DeliveryDetails; makeDefault: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const next = await fetchCustomerAddresses();
    setAddresses(next);
    const fallback = next.find(address => address.isDefault);
    if (fallback) onDefaultChange?.(fallback.details);
  }, [onDefaultChange]);
  useEffect(() => {
    let current = true;
    void fetchCustomerAddresses().then(next => { if (current) setAddresses(next); },
      reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load addresses.'); });
    return () => { current = false; };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update addresses.'); }
    finally { setBusy(false); }
  };
  const set = (key: keyof DeliveryDetails, value: string) =>
    setEditing(current => current && { ...current, details: { ...current.details, [key]: value } });

  return (
    <div className="mt-3" aria-label="Saved addresses" role="group">
      <h4 className="font-semibold">Saved addresses</h4>
      {addresses === null && !error && <p className="mt-1 text-xs text-cocoa/60">Loading addresses…</p>}
      {addresses && addresses.length === 0 && !editing && <p className="mt-1 text-xs text-cocoa/60">No saved addresses yet.</p>}
      {addresses && addresses.length > 0 && <ul className="mt-2 space-y-2">
        {addresses.map(address => (
          <li key={address.id} className="rounded-lg border border-cocoa/15 p-2 text-xs" aria-label={`Address for ${address.details.name}`}>
            <p className="font-semibold">{address.details.name} · +91 {address.details.phone}
              {address.isDefault && <span className="ml-2 rounded-full bg-mustard/20 px-2 py-0.5 font-normal">Default</span>}</p>
            <p className="mt-1 break-words text-cocoa/75">{deliveryAddressText(address.details)}</p>
            <div className="mt-1 flex flex-wrap gap-x-4">
              <button type="button" disabled={busy} className="min-h-9 underline"
                onClick={() => { setEditing({ id: address.id, details: address.details, makeDefault: address.isDefault }); setMessage(''); setError(''); }}>
                Edit</button>
              {!address.isDefault && <button type="button" disabled={busy} className="min-h-9 underline"
                onClick={() => { void run(async () => {
                  await saveCustomerAddress(address.id, address.details, true); await reload();
                  setMessage('Default address updated. It will be used for your next order.');
                }); }}>Make default</button>}
              {addresses.length > 1 && <button type="button" disabled={busy} className="min-h-9 text-red-700 underline"
                onClick={() => {
                  if (!window.confirm('Delete this address?')) return;
                  void run(async () => { await deleteCustomerAddress(address.id); await reload(); setMessage('Address deleted.'); });
                }}>Delete</button>}
            </div>
          </li>
        ))}
      </ul>}
      {editing ? <form className="mt-3 space-y-2 rounded-lg border border-mustard/40 bg-mustard/5 p-3"
        aria-label={editing.id ? 'Edit address' : 'Add address'} onSubmit={event => {
          event.preventDefault();
          const value = editing;
          void run(async () => {
            await saveCustomerAddress(value.id, { ...value.details, email: accountEmail }, value.makeDefault);
            await reload(); setEditing(null);
            setMessage(value.id ? 'Address updated.' : 'Address added.');
          });
        }}>
        <p className="font-semibold">{editing.id ? 'Edit address' : 'Add a new address'}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map(([key, label, autoComplete, maxLength, required]) => (
            <label key={key} className={`block ${key.startsWith('address') ? 'sm:col-span-2' : ''}`}>{label}
              <input required={required} maxLength={maxLength} autoComplete={autoComplete}
                inputMode={key === 'phone' || key === 'pincode' ? 'numeric' : undefined}
                value={editing.details[key]} disabled={busy} onChange={event => set(key, event.target.value)}
                className="mt-1 w-full rounded border p-2" />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={editing.makeDefault} disabled={busy}
            onChange={event => setEditing(current => current && { ...current, makeDefault: event.target.checked })} />
          Use as my default address
        </label>
        <div className="flex gap-3">
          <button disabled={busy} className="rounded-full bg-cocoa px-4 py-2 text-white">{busy ? 'Saving…' : 'Save address'}</button>
          <button type="button" disabled={busy} className="underline" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </form> : addresses && addresses.length < 10 && <button type="button" disabled={busy} className="mt-2 underline"
        onClick={() => {
          const base = addresses.find(address => address.isDefault)?.details;
          setEditing({ id: null, details: { ...emptyDeliveryDetails(), name: base?.name ?? '', phone: base?.phone ?? '' },
            makeDefault: addresses.length === 0 });
          setMessage(''); setError('');
        }}>+ Add new address</button>}
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
