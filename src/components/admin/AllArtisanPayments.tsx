import { useRef, useState } from 'react';
import { fetchArtisanApplications } from '../../services/artisans';
import { fetchArtisanActivity, recordArtisanPayment } from '../../services/artisanProfiles';
import { buildAllPaymentCsv, downloadLedgerCsv, parseAllPaymentCsv, validateLedgerFile, type ArtisanPaymentLedger } from './financialLedgerCsv';
import { downloadArtisanPaymentWorkbook } from './artisanPaymentTemplate';

async function loadDirectory() {
  const artisans: { id: string; name: string }[] = [];
  let total: number | null = null;
  for (let page = 0; ; page += 1) {
    const result = await fetchArtisanApplications('', '', page, '', null);
    if (!Number.isSafeInteger(result.total) || result.total < 0 || (total !== null && total !== result.total)) {
      throw new Error('The artisan directory changed while loading. Try again.');
    }
    total = result.total;
    artisans.push(...result.applications.map(application => ({ id: application.id, name: application.details.fullName })));
    if (artisans.length >= total) break;
    if (result.applications.length !== 25) throw new Error('The artisan directory was incomplete. Try again.');
  }
  if (artisans.length !== total || new Set(artisans.map(artisan => artisan.id)).size !== artisans.length) {
    throw new Error('The artisan directory changed while loading. Try again.');
  }
  return artisans;
}

async function loadLedger(artisans: { id: string; name: string }[]): Promise<ArtisanPaymentLedger[]> {
  const ledger: ArtisanPaymentLedger[] = [];
  for (let index = 0; index < artisans.length; index += 10) {
    const batch = await Promise.all(artisans.slice(index, index + 10).map(async artisan => ({
      ...artisan, payments: (await fetchArtisanActivity(artisan.id)).payments,
    })));
    ledger.push(...batch);
  }
  return ledger;
}

export default function AllArtisanPayments({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const importIds = useRef<{ text: string; ids: Map<number, string> } | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to process artisan payments.'); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    let saved = 0;
    let attempted = false;
    await run(async () => {
      try {
        validateLedgerFile(file);
        const text = await file.text();
        if (importIds.current?.text !== text) importIds.current = { text, ids: new Map() };
        const entries = parseAllPaymentCsv(text, await loadLedger(await loadDirectory()), importIds.current.ids);
        for (const entry of entries) {
          if (entry.exists) continue;
          attempted = true;
          await recordArtisanPayment(entry.artisanId, entry.id, entry.input);
          saved += 1;
        }
        if (attempted) onChanged();
        setMessage(`Imported ${saved} new payment${saved === 1 ? '' : 's'} across artisans. No money was sent.`);
      } catch (failure) {
        if (attempted) onChanged();
        const reason = failure instanceof Error ? failure.message : 'Unable to import payments.';
        throw new Error(`${reason}${attempted ? ` ${saved} entries confirmed saved. Verify the ledger before retrying; keep this page open for a safe retry.` : ''}`);
      }
    });
  };
  const button = 'min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <section aria-label="All artisan payment CSV" className="space-y-2 rounded-xl border border-mustard/40 p-3">
    <h3 className="font-semibold">All artisan payments</h3>
    <p className="text-xs">All artisans and dates, including voided entries, regardless of directory filters. Payment references are private; keep downloaded files secure.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => void run(async () => {
        downloadLedgerCsv('luvia-all-artisan-payments.csv', buildAllPaymentCsv(await loadLedger(await loadDirectory())));
      })}>Download all payments CSV</button>
      <button type="button" className={button} disabled={busy} onClick={() => void run(async () => {
        await downloadArtisanPaymentWorkbook(await loadDirectory());
      })}>Download all payments template</button>
      <label className={`${button} cursor-pointer ${busy ? 'opacity-50' : ''}`}>Upload all payments CSV
        <input type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload all payments CSV"
          disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file);
          }} />
      </label>
    </div>
    <p className="text-xs">Open the Excel template, replace or delete the example row, select an artisan from the dropdown, and save the Payments sheet as CSV UTF-8 before uploading.
      Keep the artisan ID in the selection; leave Record ID blank for new payments. Use Recorded status, a valid past or current date, and a reference except for Cash.
      Existing payments cannot be edited or voided through CSV. Upload files up to 5 MB.</p>
    {busy && <p role="status">Processing artisan payments...</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
