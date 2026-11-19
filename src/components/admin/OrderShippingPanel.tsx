import { useEffect, useState } from 'react';
import { requestOrderShipping, type ShippingState } from '../../services/orderShipping';
import type { OrderFulfilment } from '../../types/customer';
import { formatINR } from '../../utils/currency';
import { packagingSuggestion } from './packagingSuggestions';

export default function OrderShippingPanel({ orderId, fulfilment, items, onSaved }: {
  orderId: string; fulfilment: OrderFulfilment; items: { productName: string; quantity: number }[];
  onSaved: (value: OrderFulfilment, message: string) => void;
}) {
  const suggestion = packagingSuggestion(items);
  const [state,setState] = useState<ShippingState | null>(null);
  const [parcel,setParcel] = useState(() => ({ weight: suggestion ? '0.5' : '',length: suggestion ? String(suggestion.length) : '',
    breadth: suggestion ? String(suggestion.breadth) : '',height: suggestion?.height ? String(suggestion.height) : '' }));
  const [suggestedWeight,setSuggestedWeight] = useState(Boolean(suggestion));
  const [weightConfirmed,setWeightConfirmed] = useState(false);
  const [provider,setProvider] = useState<'shiprocket' | 'delhivery'>('shiprocket');
  const [selected,setSelected] = useState('');
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [quoteInvalid,setQuoteInvalid] = useState(false);
  const [pickupForm,setPickupForm] = useState({ date: '',time: '',count: '' });
  const [pickupConfirmed,setPickupConfirmed] = useState(false);
  const [pickupUncertain,setPickupUncertain] = useState(false);
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
        breadth: Number(parcel.breadth),height: Number(parcel.height) },
        ...(provider === 'delhivery' ? { provider } : {}) }
        : action === 'book' ? { courierId: Number(selected),quotedAt: state?.quotedAt ?? '',readyToShip: ready }
          : action === 'pickup' && state?.provider === 'delhivery' ? {
            pickupDate: pickupForm.date,pickupTime: pickupForm.time,packageCount: Number(pickupForm.count),confirmed: pickupConfirmed,
          } : action === 'pickup-resolve' ? { pickupId: state?.warehousePickup?.id,confirmed: pickupConfirmed } : {};
      const saved = await requestOrderShipping(orderId,action,options);
      setNow(Date.now());
      setState(saved);
      setProvider(saved.provider ?? 'shiprocket');
      if (saved.parcel) setParcel({ weight: String(saved.parcel.weight),length: String(saved.parcel.length),
        breadth: String(saved.parcel.breadth),height: String(saved.parcel.height) });
      if (saved.parcel) setSuggestedWeight(false);
      setQuoteInvalid(false); setSelected(''); setReady(false);
      setPickupConfirmed(false); setPickupUncertain(false);
      if (action === 'book') setNotice(saved.provider === 'delhivery'
        ? 'Shipment and AWB created. Generate the label and request warehouse pickup when packed.'
        : 'Shipment and AWB created. Generate the label and request pickup when packed.');
      if (action === 'pickup') setNotice(`Pickup request confirmed by ${saved.provider === 'delhivery' ? 'Delhivery' : 'Shiprocket'}.`);
      if (action === 'pickup-resolve') setNotice('Warehouse pickup cleared after your confirmation.');
      if (action === 'quote' && !saved.quotes.length) setNotice('No available courier for this package and delivery pincode. Arrange shipping manually.');
      if (saved.fulfilment.status !== fulfilment.status || saved.fulfilment.updatedAt !== fulfilment.updatedAt
        || JSON.stringify(saved.fulfilment.deliveryEstimate) !== JSON.stringify(fulfilment.deliveryEstimate)) {
        onSaved(saved.fulfilment,'Shipping details updated. Status-change emails are queued automatically.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Shipping request failed.');
      if ((action === 'pickup' || action === 'pickup-resolve') && state?.provider === 'delhivery') {
        setPickupUncertain(true); setPickupConfirmed(false);
      } else if (action === 'book' || action === 'pickup') {
        setState(current => current ? { ...current,reviewRequired: true } : current);
      }
    } finally { setBusy(false); }
  }
  const button = 'min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <section aria-label="Courier shipping" className="mt-4 rounded-xl border border-cocoa/20 bg-white p-3">
    <h5 className="font-semibold">Courier shipping</h5>
    <p className="mt-1 text-xs text-cocoa/70">Prepaid orders only. Confirm the packed weight and dimensions, then approve a courier. Booking does not mark the order shipped; courier tracking does.
      {' '}Compare transit days as well as cost: the selected courier may differ from the provisional checkout estimate.
      A recommendation is not a guarantee of delivery speed or reliability.</p>
    <p className="mt-1 text-xs text-cocoa/70">Selecting or approving a courier does not book it. Booking creates an order and requests an AWB.
      {' '}Recharge the chosen provider&apos;s wallet first; balance is not checked here. If booking fails, check that provider before retrying. Label and pickup are separate steps.</p>
    <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void run('status')}>
      {busy ? 'Working...' : state ? 'Refresh shipping status' : 'Manage courier shipping'}
    </button>
    {state && <>
      {(state.reviewRequired || state.busy) && <p role="alert" className="mt-3 text-sm text-red-700">
        {state.busy ? 'A shipping operation is running or was interrupted.' : 'Shipment needs reconciliation.'}
        {' '}Check this order in {state.provider === 'delhivery' ? 'Delhivery One' : 'Shiprocket'} before any further booking. Refresh to check its saved state. {state.lastError}
      </p>}
      {state.lastError && !state.reviewRequired && !state.busy && <p role="alert" className="mt-3 text-sm text-red-700">{state.lastError}</p>}
      {state.awb && <div className="mt-3 text-sm">
        <p>Courier: {state.courierName} · AWB: {state.awb}</p>
        <p>Tracking: {state.trackingStatus || 'Awaiting courier update'}</p>
        {state.syncedAt && <p className="text-xs">Last tracking update: {new Date(state.syncedAt).toLocaleString('en-IN')}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void run('label')}>Generate label</button>
          {state.labelUrl?.startsWith('https://') && <a className={button} href={state.labelUrl} target="_blank" rel="noopener noreferrer">Open shipping label</a>}
          {unshipped && state.provider !== 'delhivery' && <button type="button" className={button} disabled={blocked || state.pickupRequested}
            onClick={() => void run('pickup')}>{state.pickupRequested ? 'Pickup requested' : 'Request pickup'}</button>}
          <button type="button" className={button} disabled={busy} onClick={() => void run('sync')}>Sync courier tracking</button>
        </div>
        {state.provider === 'delhivery' && (unshipped || state.warehousePickup || state.warehousePickupError) && <div className="mt-3 rounded-lg border border-cocoa/20 p-3">
          <p className="text-sm font-semibold">Request pickup</p>
          <p className="mt-1 text-xs">Delhivery pickup covers the entire warehouse, not just this order. Check Delhivery One for requests created outside this panel.</p>
          {state.warehousePickupError && <p role="alert" className="mt-2 text-sm text-red-700">{state.warehousePickupError}</p>}
          {pickupUncertain && <p role="alert" className="mt-2 text-sm text-red-700">
            Pickup status may have changed. Refresh shipping status and check Delhivery One before trying again.
          </p>}
          {state.warehousePickup ? <>
            <p className="mt-2 text-sm">Warehouse pickup: {state.warehousePickup.state} · {state.warehousePickup.date} at {state.warehousePickup.time.slice(0,5)} IST
              {' '}· {state.warehousePickup.count} parcels{state.warehousePickup.pickupId ? ` · ID ${state.warehousePickup.pickupId}` : ''}</p>
            {state.warehousePickup.lastError && <p role="alert" className="mt-2 text-sm text-red-700">{state.warehousePickup.lastError}</p>}
            <p className="mt-2 text-xs">Before clearing, verify in Delhivery One that the pickup is completed or that no request exists. Clearing does not cancel a pickup.</p>
            <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={pickupConfirmed} disabled={busy || pickupUncertain}
              onChange={event => setPickupConfirmed(event.target.checked)} />
              I verified that this pickup is complete or no request exists.</label>
            <button type="button" className={`${button} mt-2`} disabled={busy || pickupUncertain || !pickupConfirmed
              || (state.warehousePickup.state === 'pending' && Date.parse(state.warehousePickup.createdAt) > now-5*60*1000)}
              onClick={() => void run('pickup-resolve')}>Clear verified pickup</button>
          </> : unshipped && !state.warehousePickupError && <form className="mt-2" onSubmit={event => { event.preventDefault(); void run('pickup'); }}>
            <div className="grid grid-cols-2 gap-3">
              <label>Pickup date<input required type="date" value={pickupForm.date} className="block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
                onChange={event => setPickupForm(current => ({ ...current,date: event.target.value }))} /></label>
              <label>Pickup time (IST)<input required type="time" value={pickupForm.time} className="block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
                onChange={event => setPickupForm(current => ({ ...current,time: event.target.value }))} /></label>
              <label>Expected parcels<input required type="number" min="1" max="10000" step="1" value={pickupForm.count} className="block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
                onChange={event => setPickupForm(current => ({ ...current,count: event.target.value }))} /></label>
            </div>
            <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={pickupConfirmed} disabled={blocked || pickupUncertain}
              onChange={event => setPickupConfirmed(event.target.checked)} />
              Parcels are ready and I checked there is no other open warehouse pickup.</label>
            <button type="submit" className={`${button} mt-2`} disabled={blocked || pickupUncertain || !pickupConfirmed}>Request pickup</button>
          </form>}
        </div>}
      </div>}
      {unshipped && !state.shipmentId && !state.awb && <form className="mt-3" onSubmit={event => { event.preventDefault(); void run('quote'); }}>
        <label className="mb-3 block text-sm">Shipping partner
          <select value={provider} disabled={blocked} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 bg-white p-2"
            onChange={event => { setProvider(event.target.value === 'delhivery' ? 'delhivery' : 'shiprocket');
              setQuoteInvalid(true); setSelected(''); setReady(false); }}>
            <option value="shiprocket">Shiprocket</option>
            <option value="delhivery">Delhivery</option>
          </select>
        </label>
        <fieldset disabled={blocked} className="grid grid-cols-2 gap-3">
          {([['weight','Packed weight (kg)'],['length','Length (cm)'],['breadth','Width (cm)'],['height','Height (cm)']] as const).map(([key,label]) =>
            <label key={key} className="text-sm">{label}<input type="number" required min={key === 'weight' ? 0.001 : 0.5}
              max={key === 'weight' ? 50 : 200} step="0.001" value={parcel[key]}
              list={key === 'weight' ? `shipping-weights-${orderId}` : undefined}
              className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
              onChange={event => { setParcel(current => ({ ...current,[key]: event.target.value }));
                if (key === 'weight') { setSuggestedWeight(false); setWeightConfirmed(false); }
                setQuoteInvalid(true); setSelected(''); setReady(false); }} /></label>)}
        </fieldset>
        <datalist id={`shipping-weights-${orderId}`}><option value="0.5" /><option value="1" /><option value="1.5" /><option value="2" /></datalist>
        {suggestion && !state.parcel && <p className="mt-2 text-xs text-cocoa/70">
          Suggested outer-box starting dimensions: the largest listed dimension on each side plus 2 cm for packaging.
          {suggestion.height ? '' : ' At least one product has only a pouch or sleeve size in the guide; enter the packed height.'}
          {' '}This does not calculate the space needed for multiple items. Measure the final outer package and weight before requesting rates.
        </p>}
        {!suggestion && items.length > 0 && !state.parcel && <p className="mt-2 text-xs text-cocoa/70">
          No complete packaging suggestion is available for this order. Measure the final outer package and weight.
        </p>}
        {suggestedWeight && <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={weightConfirmed} disabled={blocked}
            onChange={event => setWeightConfirmed(event.target.checked)} />
          0.5 kg is a starting guess, not a product weight. I verified the actual packed weight.
        </label>}
        <p className="mt-2 text-xs text-cocoa/70">Use the final packed parcel. Couriers may charge by volumetric weight. Rates expire after 15 minutes and do not change the customer's paid shipping charge.</p>
        <button type="submit" className={`${button} mt-2`} disabled={blocked || (suggestedWeight && !weightConfirmed)}>Check available couriers</button>
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
