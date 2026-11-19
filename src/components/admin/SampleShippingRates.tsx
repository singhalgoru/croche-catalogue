import { useState } from 'react';
import { compareSampleShippingRates, type SampleRateResult } from '../../services/orderShipping';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import { formatINR } from '../../utils/currency';
import { packagingSuggestion } from './packagingSuggestions';

type SampleItem = { id: string; productName: string; quantity: string };

export default function SampleShippingRates() {
  const [values,setValues] = useState({ pincode: '',weight: '',length: '',breadth: '',height: '' });
  const [products,setProducts] = useState<Pick<ManagedProduct,'id' | 'name'>[] | null>(null);
  const [loadingProducts,setLoadingProducts] = useState(false);
  const [productError,setProductError] = useState('');
  const [productId,setProductId] = useState('');
  const [items,setItems] = useState<SampleItem[]>([]);
  const [suggestedWeight,setSuggestedWeight] = useState(false);
  const [weightConfirmed,setWeightConfirmed] = useState(false);
  const [results,setResults] = useState<SampleRateResult[] | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const validItems = items.every(item => /^[1-9]\d*$/.test(item.quantity) && Number.isSafeInteger(Number(item.quantity)));
  const suggestion = validItems ? packagingSuggestion(items.map(item => ({
    productName: item.productName,quantity: Number(item.quantity),
  }))) : null;
  async function loadProducts() {
    setLoadingProducts(true); setProductError('');
    try { setProducts(await fetchManagedProducts()); }
    catch (failure) { setProductError(failure instanceof Error ? failure.message : 'Unable to load products.'); }
    finally { setLoadingProducts(false); }
  }
  function updateItems(next: SampleItem[]) {
    const dimensions = packagingSuggestion(next.map(item => ({ productName: item.productName,quantity: Number(item.quantity) })));
    setItems(next);
    setValues(current => ({ ...current,weight: dimensions ? '0.5' : '',length: dimensions ? String(dimensions.length) : '',
      breadth: dimensions ? String(dimensions.breadth) : '',height: dimensions?.height ? String(dimensions.height) : '' }));
    setSuggestedWeight(Boolean(dimensions)); setWeightConfirmed(false); setResults(null); setError('');
  }
  async function compare() {
    setBusy(true); setError(''); setResults(null);
    try {
      setResults(await compareSampleShippingRates(values.pincode,{ weight: Number(values.weight),length: Number(values.length),
        breadth: Number(values.breadth),height: Number(values.height) }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to compare rates.'); }
    finally { setBusy(false); }
  }
  return <details className="my-3 rounded-xl border border-cocoa/20 bg-white p-3"
    onToggle={event => { if (event.currentTarget.open && !products && !loadingProducts && !productError) void loadProducts(); }}>
    <summary className="cursor-pointer font-semibold">Compare sample shipping rates</summary>
    <p className="mt-2 text-xs">Compare prepaid estimates for a sample parcel. No order, shipment or pickup is created; actual charges can change. Transit times are estimates after courier pickup.</p>
    <form className="mt-3" onSubmit={event => { event.preventDefault(); void compare(); }}>
      <fieldset disabled={busy} className="mb-3">
        <label className="block text-sm">Sample product
          <select value={productId} disabled={loadingProducts || !products?.length}
            className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 bg-white p-2"
            onChange={event => setProductId(event.target.value)}>
            <option value="">{loadingProducts ? 'Loading products...' : 'Select a product (optional)'}</option>
            {products?.filter(product => !items.some(item => item.id === product.id)).map(product =>
              <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={!productId} className="mt-2 min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={() => {
            const product = products?.find(candidate => candidate.id === productId);
            if (product) { updateItems([...items,{ id: product.id,productName: product.name,quantity: '1' }]); setProductId(''); }
          }}>Add product</button>
        {productError && <p role="alert" className="mt-2 text-sm text-red-700">{productError}{' '}
          <button type="button" className="underline" onClick={() => void loadProducts()}>Retry</button></p>}
        {products && !products.length && <p className="mt-2 text-sm">No products available. Enter parcel details manually.</p>}
        {items.map(item => <div key={item.id} className="mt-2 flex flex-wrap items-end gap-2">
          <span className="mr-auto text-sm">{item.productName}</span>
          <label className="text-sm">Quantity for {item.productName}
            <input type="number" min="1" step="1" required value={item.quantity}
              className="mt-1 block min-h-11 w-24 rounded-lg border border-cocoa/25 p-2"
              onChange={event => updateItems(items.map(current => current.id === item.id
                ? { ...current,quantity: event.target.value } : current))} />
          </label>
          <button type="button" className="min-h-11 rounded-full border border-cocoa/25 px-4 text-sm"
            onClick={() => updateItems(items.filter(current => current.id !== item.id))}>Remove {item.productName}</button>
        </div>)}
      </fieldset>
      <fieldset disabled={busy} className="grid grid-cols-2 gap-3">
        <label className="text-sm">Delivery pincode<input required pattern="[1-9][0-9]{5}" inputMode="numeric"
          value={values.pincode} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
          onChange={event => { setValues(current => ({ ...current,pincode: event.target.value })); setResults(null); }} /></label>
        {([['weight','Packed weight (kg)'],['length','Length (cm)'],['breadth','Width (cm)'],['height','Height (cm)']] as const).map(([key,label]) =>
          <label key={key} className="text-sm">{label}<input required type="number" min={key === 'weight' ? 0.001 : 0.5}
            max={key === 'weight' ? 50 : 200} step="0.001" value={values[key]}
            list={key === 'weight' ? 'sample-shipping-weights' : undefined}
            className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2"
            onChange={event => { setValues(current => ({ ...current,[key]: event.target.value }));
              if (key === 'weight') { setSuggestedWeight(false); setWeightConfirmed(false); }
              setResults(null); }} /></label>)}
      </fieldset>
      <datalist id="sample-shipping-weights"><option value="0.5" /><option value="1" /><option value="1.5" /><option value="2" /></datalist>
      {items.length > 0 && <p className="mt-2 text-xs text-cocoa/70">
        {suggestion ? 'Suggested outer-box dimensions use the largest listed dimension on each side plus 2 cm.'
          : 'No complete packaging suggestion is available for these products; enter the dimensions manually.'}
        {suggestion && !suggestion.height ? ' A product has only a pouch or sleeve size in the guide; enter the packed height.' : ''}
        {' '}Multiple items may need a larger box. Changing products or quantities resets the parcel fields. Measure the final packed parcel and weight for a reliable estimate.
      </p>}
      {suggestedWeight && <label className="mt-2 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={weightConfirmed} disabled={busy} onChange={event => setWeightConfirmed(event.target.checked)} />
        0.5 kg is a starting guess, not a product weight. I verified the actual packed weight.
      </label>}
      <button type="submit" disabled={busy || !validItems || (suggestedWeight && !weightConfirmed)} className="mt-3 min-h-11 rounded-full border border-cocoa/25 px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Comparing...' : 'Compare rates'}</button>
    </form>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {results?.map(result => <div key={result.provider} className="mt-3 text-sm">
      <p className="font-semibold">{result.provider === 'shiprocket' ? 'Shiprocket' : 'Delhivery'}</p>
      {result.error ? <p role="alert" className="text-red-700">Rates unavailable: {result.error}</p>
        : result.quotes.length ? <ul>{result.quotes.map(quote => <li key={quote.id}>
          {quote.name}: {formatINR(quote.charge)}{quote.days ? ` · ${quote.days} days` : ' · Transit estimate unavailable'}
          {quote.recommended ? ' · Shiprocket recommended' : ''}
        </li>)}</ul> : <p>No available couriers for this parcel and pincode.</p>}
    </div>)}
  </details>;
}
