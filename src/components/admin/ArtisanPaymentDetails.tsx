import { useEffect, useState } from 'react';
import ArtisanPaymentFields from '../ArtisanPaymentFields';
import { emptyArtisanPayment, paymentStatus, readPaymentDetails, requestPaymentDetails, savePaymentDetails,
  type ArtisanPaymentStatus } from '../../services/artisanPaymentDetails';

export default function ArtisanPaymentDetails({ id,refreshKey }: { id: string; refreshKey: number }) {
  const [status,setStatus] = useState<ArtisanPaymentStatus | null>(null);
  const [details,setDetails] = useState(emptyArtisanPayment);
  const [editing,setEditing] = useState(false);
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void paymentStatus(id).then(value => { if (active) setStatus(value); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load payment status.'); });
    return () => { active = false; };
  },[id,refreshKey]);
  useEffect(() => {
    if (!editing) return;
    const hide = () => { if (document.visibilityState !== 'visible') { setEditing(false); setDetails(emptyArtisanPayment()); setConfirmed(false); } };
    const timer = window.setTimeout(() => { setEditing(false); setDetails(emptyArtisanPayment()); setConfirmed(false); },60000);
    document.addEventListener('visibilitychange',hide);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange',hide); };
  },[editing]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setStatus(await paymentStatus(id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update payment details.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Private payment details" className="space-y-3 rounded-xl border border-mustard/40 p-4">
    <h3 className="font-semibold">Private payment details</h3>
    <p className="text-sm">Trial requires payment details in the artisan&apos;s own name. The holder name must match the application name. Confirm it with the artisan; this does not independently verify account ownership.</p>
    {status && <p className="text-sm">{status.verified ? 'Name confirmed' : status.provided ? 'Details submitted; name confirmation required'
      : status.requested ? 'Request sent or queued; awaiting details' : 'No payment details saved'}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !status || status.requested || status.provided} className="min-h-11 underline"
        onClick={() => void run(async () => { await requestPaymentDetails(id); setNotice('Payment request queued. The link expires in 24 hours.'); })}>Request payment details by email</button>
      {!editing && <button type="button" disabled={busy || !status} className="min-h-11 underline"
        onClick={() => void run(async () => {
          const result = await readPaymentDetails(id);
          if (document.visibilityState === 'visible') { setDetails(result?.details ?? emptyArtisanPayment()); setEditing(true); }
        })}>{status?.provided ? 'View or edit payment details' : 'Enter payment details manually'}</button>}
    </div>
    {editing && <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        await savePaymentDetails(id,details); setDetails(emptyArtisanPayment()); setEditing(false); setConfirmed(false);
        setNotice('Payment details saved and name confirmed.');
      });
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <ArtisanPaymentFields value={details} onChange={value => { setDetails(value); setConfirmed(false); }} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)} />
          I confirmed with the artisan that these details are in their own name and have their consent to save them for payment.</label>
        <button className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream">Save and confirm name</button>
        <button type="button" className="ml-4 min-h-11 underline" onClick={() => {
          setEditing(false); setDetails(emptyArtisanPayment()); setConfirmed(false);
        }}>Cancel</button>
      </fieldset>
      <p className="text-xs">Details hide after one minute or when leaving the tab. Do not copy them into notes, email or payment references.</p>
    </form>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
