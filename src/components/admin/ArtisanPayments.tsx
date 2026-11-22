import { useEffect, useRef, useState } from 'react';
import { artisanPaymentMethods, fetchArtisanActivity, recordArtisanPayment, voidArtisanPayment,
  type ArtisanPayment, type ArtisanPaymentInput } from '../../services/artisanProfiles';
import { localDate } from '../../utils/date';
import AdminDialog from './AdminDialog';
import { buildPaymentCsv, downloadLedgerCsv, parsePaymentCsv, validateLedgerFile } from './financialLedgerCsv';

const emptyPayment = (): ArtisanPaymentInput => ({ date: localDate(), amount: '', method: 'UPI', reference: '', description: '' });
const input = 'mt-1 block min-h-11 w-full rounded border p-2';
const button = 'min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50';
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ArtisanPayments({ artisan, onClose, onChanged }: {
  artisan: { id: string; name: string }; onClose: () => void; onChanged: () => void;
}) {
  const [payments, setPayments] = useState<ArtisanPayment[] | null>(null);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState(emptyPayment);
  const [voidId, setVoidId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const request = useRef<{ signature: string; id: string } | null>(null);
  const importIds = useRef<{ text: string; ids: Map<number, string> } | null>(null);
  useEffect(() => {
    let active = true;
    void fetchArtisanActivity(artisan.id).then(result => {
      if (active) { setPayments(result.payments); setLoadError(''); }
    }).catch(failure => {
      if (active) setLoadError(failure instanceof Error ? failure.message : 'Unable to load payment history.');
    });
    return () => { active = false; };
  }, [artisan.id, reload]);
  const refresh = () => { setPayments(null); setLoadError(''); setReload(value => value + 1); onChanged(); };
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save payment.'); }
    finally { setBusy(false); }
  };
  const importPayments = async (file: File) => {
    if (!payments) return;
    setBusy(true); setError(''); setMessage('');
    let saved = 0;
    let attempted = false;
    try {
      validateLedgerFile(file);
      const text = await file.text();
      if (importIds.current?.text !== text) importIds.current = { text, ids: new Map() };
      const entries = parsePaymentCsv(text, payments, importIds.current.ids);
      for (const entry of entries) {
        if (entry.exists) continue;
        attempted = true;
        await recordArtisanPayment(artisan.id, entry.id, entry.input);
        saved += 1;
      }
      if (attempted) refresh();
      setMessage(`Imported ${saved} new payment${saved === 1 ? '' : 's'} for this artisan. No money was sent.`);
    } catch (failure) {
      if (attempted) refresh();
      const reason = failure instanceof Error ? failure.message : 'Unable to import payments.';
      setError(`${reason}${attempted ? ` ${saved} entries confirmed saved. Verify the ledger before retrying; keep this dialog open for a safe retry.` : ''}`);
    } finally { setBusy(false); }
  };
  const total = payments?.reduce((sum, item) => sum + (item.voided_at ? 0 : Math.round(item.amount * 100)), 0);
  return <AdminDialog title={`Payments for ${artisan.name}`} onClose={onClose} busy={busy}>
    <div className="space-y-4 p-4">
      <p className="text-sm">Record money already paid; this does not send money, calculate wages owed or add a business expense. Use a transaction reference, not bank details or a UPI address.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loadError ? <div><p role="alert" className="text-red-700">{loadError}</p>
        <button type="button" className="min-h-11 underline" onClick={() => { setLoadError(''); setReload(value => value + 1); }}>Retry payment history</button></div>
        : payments === null ? <p role="status">Loading payments...</p>
          : <p className="font-semibold">Total paid (excluding voided entries): {currency.format((total ?? 0) / 100)}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy || !payments || Boolean(loadError)}
          onClick={() => payments && downloadLedgerCsv('luvia-artisan-payments.csv', buildPaymentCsv(payments))}>Download payments CSV</button>
        <button type="button" className={button} onClick={() => downloadLedgerCsv('luvia-artisan-payments-template.csv', buildPaymentCsv([]))}>Download payments CSV template</button>
        <label className={`${button} cursor-pointer ${busy || !payments || loadError ? 'opacity-50' : ''}`}>Upload payments CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload payments CSV"
            disabled={busy || !payments || Boolean(loadError)} onChange={event => {
              const file = event.target.files?.[0]; event.target.value = ''; if (file) void importPayments(file);
            }} />
        </label>
      </div>
      <p className="text-xs">CSV is for this artisan only. Leave Record ID blank and use Recorded status for new payments. Use YYYY-MM-DD or DD/MM/YYYY; methods are UPI, Bank transfer, Cash or Other. A reference is required except for Cash. Existing entries cannot be edited or voided through CSV.</p>
      <form aria-label="Record artisan payment" className="space-y-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const signature = JSON.stringify(payment);
          if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
          await recordArtisanPayment(artisan.id, request.current.id, payment);
          setPayment(emptyPayment()); request.current = null; refresh();
        }, 'Payment recorded. No money was sent by this site.');
      }}>
        <fieldset disabled={busy || !payments || Boolean(loadError)} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Payment date<input required type="date" min="2000-01-01" max={localDate()} value={payment.date}
            onChange={event => setPayment(current => ({ ...current, date: event.target.value }))} className={input} /></label>
          <label className="text-sm">Amount paid (INR)<input required type="number" min="0.01" max="10000000" step="0.01"
            value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: event.target.value }))} className={input} /></label>
          <label className="text-sm">Payment method<select value={payment.method} onChange={event => {
            const method = artisanPaymentMethods.find(value => value === event.target.value);
            if (method) setPayment(current => ({ ...current, method }));
          }} className={input}>{artisanPaymentMethods.map(method => <option key={method}>{method}</option>)}</select></label>
          <label className="text-sm">Transaction reference (optional for cash)<input required={payment.method !== 'Cash'} maxLength={200}
            value={payment.reference} onChange={event => setPayment(current => ({ ...current, reference: event.target.value }))} className={input} /></label>
          <label className="text-sm sm:col-span-2">Work / batch description<textarea required rows={2} maxLength={1000} value={payment.description}
            onChange={event => setPayment(current => ({ ...current, description: event.target.value }))} className={input} /></label>
          <p className="text-xs sm:col-span-2">Correct a mistake by voiding the entry with a reason and recording a replacement.</p>
          <button className={`${button} justify-self-start`}>Record payment</button>
        </fieldset>
      </form>
      {payments?.length === 0 && <p className="text-sm">No payments recorded.</p>}
      {payments && <ul className="space-y-3">{payments.map(entry => <li key={entry.id} className="space-y-1 rounded border p-3 text-sm">
        <p className="font-semibold">{entry.paid_on} - {currency.format(entry.amount)} - {entry.method}{entry.voided_at ? ' - Voided' : ''}</p>
        <p className="whitespace-pre-wrap break-words">{entry.description}</p>
        {entry.reference && <p className="break-all">Reference: {entry.reference}</p>}
        {entry.voided_at ? <p className="break-words">Voided {new Date(entry.voided_at).toLocaleString('en-IN')}: {entry.void_reason}</p>
          : <button type="button" disabled={busy} className="min-h-11 text-red-700 underline" onClick={() => { setVoidId(entry.id); setVoidReason(''); }}>Void payment {entry.paid_on} {currency.format(entry.amount)}</button>}
      </li>)}</ul>}
      {voidId && <form aria-label="Void artisan payment" className="space-y-2 rounded border border-red-200 p-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => { await voidArtisanPayment(voidId, voidReason); setVoidId(''); setVoidReason(''); refresh(); }, 'Payment voided; original entry retained.');
      }}>
        <label className="block text-sm">Reason for voiding<textarea required rows={2} maxLength={500} value={voidReason}
          disabled={busy} onChange={event => setVoidReason(event.target.value)} className={input} /></label>
        <button disabled={busy} className={button}>Confirm void payment</button>
        <button type="button" disabled={busy} className="ml-4 min-h-11 underline" onClick={() => setVoidId('')}>Cancel void</button>
      </form>}
    </div>
  </AdminDialog>;
}
