import { useState } from 'react';
import { compareSampleShippingRates, type SampleRateResult } from '../../services/orderShipping';
import { formatINR } from '../../utils/currency';

export default function SampleShippingRates() {
  const [values,setValues] = useState({ pincode: '',weight: '',length: '',breadth: '',height: '' });
  const [results,setResults] = useState<SampleRateResult[] | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function compare() {
    setBusy(true); setError(''); setResults(null);
    try {
      setResults(await compareSampleShippingRates(values.pincode,{ weight: Number(values.weight),length: Number(values.length),
        breadth: Number(values.breadth),height: Number(values.height) }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to compare rates.'); }
    finally { setBusy(false); }
  }
  return <details className="my-3 rounded-xl border border-cocoa/20 bg-white p-3">
    <summary className="cursor-pointer font-semibold">Compare sample shipping rates</summary>
    <p className="mt-2 text-xs">Compare prepaid estimates for a sample parcel. No order, shipment or pickup is created; actual charges can change.</p>
    <form className="mt-3" onSubmit={event => { event.preventDefault(); void compare(); }}>
      <fieldset disabled={busy} className="grid grid-cols-2 gap-3">
        <label className="text-sm">Delivery pincode<input required pattern="[1-9][0-9]{5}" inputMode="numeric"
          value={values.pincode} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
          onChange={event => { setValues(current => ({ ...current,pincode: event.target.value })); setResults(null); }} /></label>
        {([['weight','Packed weight (kg)'],['length','Length (cm)'],['breadth','Width (cm)'],['height','Height (cm)']] as const).map(([key,label]) =>
          <label key={key} className="text-sm">{label}<input required type="number" min={key === 'weight' ? 0.001 : 0.5}
            max={key === 'weight' ? 50 : 200} step="0.001" value={values[key]}
            className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
            onChange={event => { setValues(current => ({ ...current,[key]: event.target.value })); setResults(null); }} /></label>)}
      </fieldset>
      <button type="submit" disabled={busy} className="mt-3 min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Comparing...' : 'Compare rates'}</button>
    </form>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {results?.map(result => <div key={result.provider} className="mt-3 text-sm">
      <p className="font-semibold">{result.provider === 'shiprocket' ? 'Shiprocket' : 'Delhivery'}</p>
      {result.error ? <p role="alert" className="text-red-700">Rates unavailable: {result.error}</p>
        : result.quotes.length ? <ul>{result.quotes.map(quote => <li key={quote.id}>
          {quote.name}: {formatINR(quote.charge)}{quote.days ? ` · ${quote.days} days` : ''}
          {quote.recommended ? ' · Shiprocket recommended' : ''}
        </li>)}</ul> : <p>No available couriers for this parcel and pincode.</p>}
    </div>)}
  </details>;
}
