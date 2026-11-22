import { useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteMaterialPurchase, downloadMaterialReceipt, fetchMaterialPurchases, saveMaterialPurchase, summarizeMaterialPurchases,
  type MaterialPurchase, type MaterialPurchaseInput } from '../../services/materialPurchases';
import { formatINRExact } from '../../utils/currency';
import { localDate } from '../../utils/date';
import { buildMaterialCsv, downloadLedgerCsv, parseMaterialCsv, validateLedgerFile } from './financialLedgerCsv';

type Draft = Omit<MaterialPurchaseInput, 'quantity' | 'total'> & { quantity: string; total: string; receipt_name: string | null };
const field = 'mt-1 w-full min-w-0 rounded-lg border border-mustard/50 bg-white px-3 py-2';
const button = 'min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50';
const newDraft = (): Draft => ({ id: crypto.randomUUID(), purchased_on: localDate(), material: '', supplier: '',
  quantity: '', unit: '', total: '', payment_status: 'Unpaid', notes: '', receipt_name: null });

export default function MaterialsPanel() {
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const importIds = useRef<{ text: string; ids: Map<number, string> } | null>(null);

  const load = async () => {
    try { setPurchases(await fetchMaterialPurchases()); setLoaded(true); return true; }
    catch (failure) {
      setLoaded(false);
      setError(failure instanceof Error ? failure.message : 'Unable to load purchases.');
      return false;
    }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, []);
  const update = (patch: Partial<Draft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await saveMaterialPurchase({ ...draft, quantity: Number(draft.quantity), total: Number(draft.total) }, file, removeReceipt);
      setDraft(null); setFile(null); setRemoveReceipt(false); setMessage('Purchase saved.');
      setMonth(draft.purchased_on.slice(0, 7)); setLoading(true);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save purchase.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await deleteMaterialPurchase(id);
      setDeleteId(null); setMessage('Purchase and its receipt deleted.');
      setLoading(true);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to delete purchase.'); }
    finally { setBusy(false); }
  };
  const download = async (id: string) => {
    setBusy(true); setError(null);
    try { await downloadMaterialReceipt(id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to download receipt.'); }
    finally { setBusy(false); }
  };
  const importCsv = async (csv: File) => {
    setBusy(true); setError(null); setMessage(null);
    let saved = 0;
    let attempted = false;
    try {
      validateLedgerFile(csv);
      const text = await csv.text();
      if (importIds.current?.text !== text) importIds.current = { text, ids: new Map() };
      const entries = parseMaterialCsv(text, purchases, importIds.current.ids);
      for (const entry of entries) {
        attempted = true;
        await saveMaterialPurchase(entry, null, false);
        saved += 1;
      }
      setLoading(true);
      if (await load()) setMessage(`Imported ${saved} purchase${saved === 1 ? '' : 's'}. Existing receipts were preserved.`);
      else setError(`Saved ${saved} purchases, but could not reload them. Refresh purchases to verify.`);
    } catch (failure) {
      if (attempted) { setLoading(true); await load(); }
      const reason = failure instanceof Error ? failure.message : 'Unable to import purchases.';
      setError(`${reason}${attempted ? ` ${saved} entries confirmed saved. Verify the register before retrying; keep this page open for a safe retry.` : ''}`);
    } finally { setBusy(false); }
  };
  const { monthly, paid, unpaid, materials } = summarizeMaterialPurchases(purchases, month);
  return <section aria-label="Material purchases" className="rounded-2xl bg-white p-4 shadow-sm">
    <h2 className="font-heading text-2xl font-bold text-cocoa">Material purchases</h2>
    <p className="mt-2 text-sm text-cocoa/75">Record purchases, not stock or material consumption. These amounts do not affect Sales profit.
      Paid and unpaid totals are grouped by purchase date, not payment date; partial payments are not tracked.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Purchase month
        <input aria-label="Purchase month" type="month" value={month} onChange={event => setMonth(event.target.value)} className={field} />
      </label>
      <button type="button" className={button} disabled={busy || loading || !loaded || !!draft} onClick={() => {
        setDraft(newDraft()); setFile(null); setRemoveReceipt(false); setError(null); setMessage(null); setDeleteId(null);
      }}>Add purchase</button>
      <button type="button" className={button} disabled={busy || loading} onClick={() => { setError(null); setLoading(true); void load(); }}>Refresh purchases</button>
      <button type="button" className={button} disabled={busy || loading || !loaded}
        onClick={() => downloadLedgerCsv('luvia-material-purchases.csv', buildMaterialCsv(purchases))}>Download purchases CSV</button>
      <label className={`${button} cursor-pointer ${busy || loading || !loaded || !!draft ? 'opacity-50' : ''}`}>
        Upload purchases CSV
        <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload purchases CSV"
          disabled={busy || loading || !loaded || !!draft} onChange={event => {
            const csv = event.target.files?.[0];
            event.target.value = '';
            if (csv) void importCsv(csv);
          }} />
      </label>
    </div>
    <p className="mt-2 text-xs text-cocoa/65">CSV covers all purchases. Leave Record ID blank for new rows; existing IDs update purchases. Receipts are not included in CSV and existing attachments are kept.</p>
    {draft && <form onSubmit={event => void save(event)} className="mt-4 grid gap-3 rounded-xl bg-cream/50 p-4 sm:grid-cols-2">
      <h3 className="font-bold sm:col-span-2">{purchases.some(item => item.id === draft.id) ? 'Edit purchase' : 'New purchase'}</h3>
      <label className="text-sm font-semibold">Purchase date *
        <input className={field} type="date" required disabled={busy} value={draft.purchased_on}
          onChange={event => update({ purchased_on: event.target.value })} /></label>
      <label className="text-sm font-semibold">Material *
        <input className={field} required maxLength={150} disabled={busy} value={draft.material}
          onChange={event => update({ material: event.target.value })} /></label>
      <label className="text-sm font-semibold">Supplier
        <input className={field} maxLength={150} disabled={busy} value={draft.supplier}
          onChange={event => update({ supplier: event.target.value })} /></label>
      <label className="text-sm font-semibold">Quantity *
        <input className={field} type="number" required min="0.001" max="999999999.999" step="0.001" disabled={busy}
          value={draft.quantity} onChange={event => update({ quantity: event.target.value })} /></label>
      <label className="text-sm font-semibold">Unit * <span className="font-normal">(e.g. balls, metres, kg)</span>
        <input className={field} required maxLength={30} disabled={busy} value={draft.unit}
          onChange={event => update({ unit: event.target.value })} /></label>
      <label className="text-sm font-semibold">Total purchase cost (₹) *
        <input className={field} type="number" required min="0.01" max="9999999999.99" step="0.01" disabled={busy}
          value={draft.total} onChange={event => update({ total: event.target.value })} /></label>
      <label className="text-sm font-semibold">Payment status *
        <select className={field} value={draft.payment_status} disabled={busy}
          onChange={event => update({ payment_status: event.target.value === 'Paid' ? 'Paid' : 'Unpaid' })}>
          <option>Unpaid</option><option>Paid</option>
        </select></label>
      <label className="text-sm font-semibold sm:col-span-2">Notes
        <textarea className={field} maxLength={1000} disabled={busy} value={draft.notes}
          onChange={event => update({ notes: event.target.value })} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Optional receipt (PDF, JPG or PNG, up to 2 MB)
        <input className={field} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy}
          onChange={event => { setFile(event.target.files?.[0] ?? null); setRemoveReceipt(false); }} /></label>
      {draft.receipt_name && <label className="text-sm sm:col-span-2">
        <input type="checkbox" checked={removeReceipt} disabled={busy || !!file}
          onChange={event => setRemoveReceipt(event.target.checked)} /> Remove existing receipt: {draft.receipt_name}
      </label>}
      <div className="flex gap-2 sm:col-span-2">
        <button className={`${button} bg-cocoa text-cream`} disabled={busy}>{busy ? 'Saving…' : 'Save purchase'}</button>
        <button className={button} type="button" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
      </div>
    </form>}
    {loading ? <p className="mt-4">Loading purchases…</p> : loaded && !month ?
      <p className="mt-4 text-sm">Choose a purchase month.</p> : loaded ? <>
      <div className="mt-4 rounded-xl bg-cream/50 p-3 text-sm">
        <h3 className="font-bold">Monthly purchase summary</h3>
        <p>Purchase value: {formatINRExact(paid + unpaid)} · Paid: {formatINRExact(paid)} · Unpaid: {formatINRExact(unpaid)}</p>
        {materials.length > 0 && <ul className="mt-2">{materials.map(item =>
          <li key={item.name}>{item.name}: {formatINRExact(item.total)}</li>)}</ul>}
      </div>
      {monthly.length === 0 && <p className="mt-3 text-sm">No purchases for this month.</p>}
      <ul className="mt-3 space-y-3">{monthly.map(item => <li key={item.id} className="rounded-xl border border-cocoa/15 p-3">
        <div className="break-words text-sm"><strong>{item.material} · {formatINRExact(item.total)}</strong>
          <p>{item.purchased_on} · {item.quantity} {item.unit} · {item.payment_status}</p>
          {item.supplier && <p>Supplier: {item.supplier}</p>}
          {item.notes && <p className="whitespace-pre-wrap">{item.notes}</p>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy || !!draft} aria-label={`Edit purchase ${item.material}`}
            onClick={() => { setDraft({ ...item, quantity: String(item.quantity), total: String(item.total) }); setFile(null);
              setRemoveReceipt(false); setDeleteId(null); setError(null); setMessage(null); }}>Edit</button>
          <button type="button" className={button} disabled={busy || !!draft} aria-label={`Delete purchase ${item.material}`}
            onClick={() => setDeleteId(item.id)}>Delete</button>
          {item.receipt_name && <button type="button" className={button} disabled={busy}
            onClick={() => void download(item.id)}>Download receipt: {item.receipt_name}</button>}
        </div>
        {deleteId === item.id && <div className="mt-2 text-sm text-red-800"><p>Delete this purchase and its receipt?</p>
          <button type="button" className="mr-3 min-h-11 font-bold underline" disabled={busy} onClick={() => void remove(item.id)}>Confirm delete</button>
          <button type="button" className="min-h-11 underline" disabled={busy} onClick={() => setDeleteId(null)}>Cancel delete</button></div>}
      </li>)}</ul>
    </> : <p className="mt-4 text-sm">Purchases are unavailable. Use Refresh purchases to retry.</p>}
  </section>;
}
