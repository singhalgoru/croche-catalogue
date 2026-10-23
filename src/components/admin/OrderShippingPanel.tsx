import { useEffect, useState } from 'react';
import { requestOrderShipping, type ShippingState } from '../../services/orderShipping';
import type { OrderFulfilment } from '../../types/customer';
import { formatINR } from '../../utils/currency';

export default function OrderShippingPanel({ orderId, fulfilment, onSaved }: {
  orderId: string; fulfilment: OrderFulfilment; onSaved: (value: OrderFulfilment, message: string) => void;
}) {
  const [state,setState] = useState<ShippingState | null>(null);
  const [parcel,setParcel] = useState({ weight: '',length: '',breadth: '',height: '' });
  const [selected,setSelected] = useState('');
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [quoteInvalid,setQuoteInvalid] = useState(false);
  const [now,setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()),30000);
    return () => window.clearInterval(timer);
  },[]);
  const unshipped = ['confirmed','processing'].includes(fulfilment.status);
  const blocked = busy || Boolean(state?.busy || state?.reviewRequired);
  const quote = !quoteInvalid ? state?.quotes.find(q => String(q.id) === selected) : undefined;
  const basis = state?.marginBasis;
  const marginLabel = (charge: number) => {
    if (!basis) return 'Est. margin unavailable';
    const netRevenue = basis.revenue - basis.gst;
    const profit = netRevenue - basis.gatewayFee - basis.productCosts - charge;
    return `Est. profit ${formatINR(profit)} · margin ${netRevenue > 0 ? `${(profit / netRevenue * 100).toFixed(1)}%` : 'unavailable'}`;
  };
  const expired = !state?.quotedAt || Date.parse(state.quotedAt) < now-15*60*1000;
  async function run(action: Parameters<typeof requestOrderShipping>[1]) {
    setBusy(true); setError(''); setNotice('');
    try {
      const options = action === 'quote' ? { parcel: { weight: Number(parcel.weight),length: Number(parcel.length),
        breadth: Number(parcel.breadth),height: Number(parcel.height) } }
        : action === 'book' ? { courierId: Number(selected),quotedAt: state?.quotedAt ?? '',readyToShip: ready } : {};
      const saved = await requestOrderShipping(orderId,action,options);
      setNow(Date.now());
      setState(saved);
      if (saved.parcel) setParcel({ weight: String(saved.parcel.weight),length: String(saved.parcel.length),
        breadth: String(saved.parcel.breadth),height: String(saved.parcel.height) });
      setQuoteInvalid(false); setSelected(''); setReady(false);
      if (action === 'book') setNotice('Shipment and AWB created. Generate the label and request pickup when packed.');
      if (action === 'pickup') setNotice('Pickup request confirmed by Shiprocket.');
      if (action === 'quote' && !saved.quotes.length) setNotice('No available courier for this package and delivery pincode. Arrange shipping manually.');
      if (saved.fulfilment.status !== fulfilment.status || saved.fulfilment.updatedAt !== fulfilment.updatedAt
        || JSON.stringify(saved.fulfilment.deliveryEstimate) !== JSON.stringify(fulfilment.deliveryEstimate)) {
        onSaved(saved.fulfilment,'Shipping details updated. Status-change emails are queued automatically.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Shipping request failed.');
      if (action === 'book' || action === 'pickup') {
        setState(current => current ? { ...current,reviewRequired: true } : current);
      }
    } finally { setBusy(false); }
  }
  const button = 'min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <section aria-label="Shiprocket shipping" className="mt-4 rounded-xl border border-cocoa/20 bg-white p-3">
    <h5 className="font-semibold">Shiprocket shipping</h5>
    <p className="mt-1 text-xs text-cocoa/70">Prepaid orders only. Confirm the packed weight and dimensions, then approve a courier. Booking does not mark the order shipped; courier tracking does.
      {' '}Compare transit days as well as cost: the selected courier may differ from the provisional checkout estimate.
      A recommendation is not a guarantee of delivery speed or reliability.</p>
    <p className="mt-1 text-xs text-cocoa/70">Selecting or approving a courier does not book it. Book creates a Shiprocket order and requests an AWB.
      {' '}Recharge your Shiprocket wallet first; balance is not checked here. If AWB assignment fails, check the existing order in Shiprocket before retrying. Label and pickup are separate steps.</p>
    <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void run('status')}>
      {busy ? 'Working...' : state ? 'Refresh shipping status' : 'Manage Shiprocket shipping'}
    </button>
    {state && <>
      {(state.reviewRequired || state.busy) && <p role="alert" className="mt-3 text-sm text-red-700">
        {state.busy ? 'A shipping operation is running or was interrupted.' : 'Shipment needs reconciliation.'}
        {' '}Check this order in Shiprocket before any further booking. Refresh to check its saved state. {state.lastError}
      </p>}
      {state.lastError && !state.reviewRequired && !state.busy && <p role="alert" className="mt-3 text-sm text-red-700">{state.lastError}</p>}
      {state.awb && <div className="mt-3 text-sm">
        <p>Courier: {state.courierName} · AWB: {state.awb}</p>
        <p>Tracking: {state.trackingStatus || 'Awaiting courier update'}</p>
        {state.syncedAt && <p className="text-xs">Last tracking update: {new Date(state.syncedAt).toLocaleString('en-IN')}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void run('label')}>Generate label</button>
          {state.labelUrl?.startsWith('https://') && <a className={button} href={state.labelUrl} target="_blank" rel="noopener noreferrer">Open shipping label</a>}
          {unshipped && <button type="button" className={button} disabled={blocked || state.pickupRequested}
            onClick={() => void run('pickup')}>{state.pickupRequested ? 'Pickup requested' : 'Request pickup'}</button>}
          <button type="button" className={button} disabled={busy} onClick={() => void run('sync')}>Sync courier tracking</button>
        </div>
      </div>}
      {unshipped && !state.shipmentId && <form className="mt-3" onSubmit={event => { event.preventDefault(); void run('quote'); }}>
        <fieldset disabled={blocked} className="grid grid-cols-2 gap-3">
          {([['weight','Packed weight (kg)'],['length','Length (cm)'],['breadth','Width (cm)'],['height','Height (cm)']] as const).map(([key,label]) =>
            <label key={key} className="text-sm">{label}<input type="number" required min={key === 'weight' ? 0.001 : 0.5}
              max={key === 'weight' ? 50 : 200} step="0.001" value={parcel[key]}
              className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
              onChange={event => { setParcel(current => ({ ...current,[key]: event.target.value }));
                setQuoteInvalid(true); setSelected(''); setReady(false); }} /></label>)}
        </fieldset>
        <p className="mt-2 text-xs text-cocoa/70">Use the final packed parcel. Couriers may charge by volumetric weight. Rates expire after 15 minutes and do not change the customer's paid shipping charge.</p>
        <button type="submit" className={`${button} mt-2`} disabled={blocked}>Check available couriers</button>
        {!quoteInvalid && state.quotes.length > 0 && <div className="mt-3">
          <label className="text-sm">Approve courier
            <select value={selected} disabled={blocked} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 bg-white p-2"
              onChange={event => { setSelected(event.target.value); setReady(false); }}>
              <option value="">Select a courier</option>
              {state.quotes.map(q => <option key={q.id} value={q.id}>
                {q.name} — {formatINR(q.charge)}{q.days ? ` · ${q.days} days` : ''}{q.recommended ? ' · Shiprocket recommended' : ''} · {marginLabel(q.charge)}
              </option>)}
            </select>
          </label>
          {quote && <p className="mt-2 text-sm font-semibold" role="status">{marginLabel(quote.charge)}</p>}
          {basis ? <p className="mt-2 text-xs text-cocoa/70">
            Paid revenue {formatINR(basis.revenue)} (after discounts, including customer shipping);
            estimated GST {formatINR(basis.gst)}, payment fees including fee GST {formatINR(basis.gatewayFee)},
            materials/labour/packaging {formatINR(basis.productCosts)}. Each estimate subtracts that courier&apos;s charge instead of saved shipping costs.
            Margin is on revenue before GST. Tax and fees use saved sales rates; collected shipping is allocated by item value.
            Verify saved costs, including any zero values. Excludes overheads, refunds and later courier adjustments; not final accounting profit.
          </p> : <p className="mt-2 text-sm text-cocoa/70">
            Estimated margins unavailable: complete, valid saved sales cost records are required for every order item.
            Check the sales ledger before relying on profit estimates.
          </p>}
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ready} disabled={blocked} className="mt-1"
              onChange={event => setReady(event.target.checked)} />
            This order is ready to ship. I approve the selected courier and estimated charge.
          </label>
          {expired && <p className="mt-2 text-sm text-red-700">Rates expired. Check available couriers again.</p>}
          <button type="button" disabled={blocked || !ready || !quote || expired}
            className={`${button} mt-3 bg-cocoa text-white`} onClick={() => void run('book')}>
            {quote ? `Book ${quote.name} · ${formatINR(quote.charge)}` : 'Book approved courier'}
          </button>
        </div>}
      </form>}
    </>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
