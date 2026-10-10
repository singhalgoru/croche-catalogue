import { useState } from 'react';
import type { OrderFulfilment } from '../../types/customer';
import { updateOrderFulfilment } from '../../services/customer';

import { fulfilmentLabels } from '../../utils/customer';
const statuses = ['confirmed','processing','shipped','delivered'] as const;

export default function OrderFulfilmentForm({ orderId, reference, fulfilment, onSaved }: {
  orderId: string; reference: string; fulfilment: OrderFulfilment; onSaved: (value: OrderFulfilment) => void;
}) {
  const [values, setValues] = useState(fulfilment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const shipping = values.status === 'shipped' || values.status === 'delivered';
  return <form aria-label={`Update order ${reference}`} className="mt-4 rounded-xl border border-mustard/40 bg-white p-3"
    onSubmit={event => {
      event.preventDefault(); setBusy(true); setError(''); setMessage('');
      void updateOrderFulfilment(orderId, fulfilment.status, values).then(saved => {
        onSaved(saved); setValues(saved); setMessage('Order status updated.');
      }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to update order status.'))
        .finally(() => setBusy(false));
    }}>
    <h5 className="font-semibold">Manage fulfilment</h5>
    <p className="mt-1 text-xs text-cocoa/65">Payment status stays unchanged. Saved updates appear in the customer order dashboard; this does not send shipping notifications.</p>
    <label className="mt-3 block text-sm">Order status
      <select aria-label="Order status" value={values.status} disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 bg-white p-2"
        onChange={event => {
          const status = statuses.find(value => value === event.target.value);
          if (status) setValues(current => ({ ...current, status }));
        }}>
        {statuses.map(status => <option key={status} value={status}
          disabled={statuses.indexOf(status) < statuses.indexOf(fulfilment.status)}>{fulfilmentLabels[status]}</option>)}
      </select>
    </label>
    {shipping && <div className="mt-3 grid gap-3">
      <label className="text-sm">Courier name (optional)
        <input maxLength={100} value={values.courierName} disabled={busy}
          className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
          onChange={event => setValues(current => ({ ...current, courierName: event.target.value }))} />
      </label>
      <label className="text-sm">Tracking number (optional)
        <input maxLength={150} value={values.trackingNumber} disabled={busy}
          className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
          onChange={event => setValues(current => ({ ...current, trackingNumber: event.target.value }))} />
      </label>
      <label className="text-sm">Tracking link (optional, HTTPS)
        <input type="url" pattern="https://.*" maxLength={1000} value={values.trackingUrl} disabled={busy}
          className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
          onChange={event => setValues(current => ({ ...current, trackingUrl: event.target.value }))} />
      </label>
    </div>}
    <button type="submit" disabled={busy} className="mt-3 min-h-11 rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? 'Saving...' : 'Save order status'}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-sm text-green-800">{message}</p>}
  </form>;
}
