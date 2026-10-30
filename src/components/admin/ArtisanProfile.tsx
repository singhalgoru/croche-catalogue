import { useEffect, useRef, useState } from 'react';
import type { ArtisanApplication } from '../../services/artisans';
import {
  addArtisanComment, artisanPaymentMethods, fetchArtisanActivity, readArtisanPhoto, recordArtisanPayment,
  removeArtisanPhoto, saveArtisanSkills, voidArtisanPayment,
  type ArtisanActivity, type ArtisanPaymentInput,
} from '../../services/artisanProfiles';
import { localDate } from '../../utils/date';

const emptyPayment = (): ArtisanPaymentInput => ({ date: localDate(), amount: '', method: 'UPI', reference: '', description: '' });
const inputClass = 'mt-1 block min-h-11 w-full rounded border p-2';
const buttonClass = 'min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50';
const paymentCurrency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ArtisanProfile({ application, onUpdated, onActivityChanged, disabled = false, onBusyChange }: {
  application: ArtisanApplication;
  onUpdated: (application: ArtisanApplication) => void;
  onActivityChanged: () => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [rating, setRating] = useState(application.skill_rating?.toString() ?? '');
  const [capabilities, setCapabilities] = useState(application.capabilities || application.details.skills);
  const [activity, setActivity] = useState<ArtisanActivity | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState(emptyPayment);
  const [voidId, setVoidId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [photo, setPhoto] = useState('');
  const [confirmPhotoRemoval, setConfirmPhotoRemoval] = useState(false);
  const commentRequest = useRef<{ signature: string; id: string } | null>(null);
  const paymentRequest = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetchArtisanActivity(application.id).then(result => { if (active) { setActivity(result); setLoadError(''); } })
      .catch(failure => { if (active) setLoadError(failure instanceof Error ? failure.message : 'Unable to load artisan activity.'); });
    return () => { active = false; };
  }, [application.id, reloadKey]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== 'visible') setPhoto(''); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); onBusyChange?.(true); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save artisan profile.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const refreshActivity = () => { setReloadKey(value => value + 1); onActivityChanged(); };
  const totalPaid = activity?.payments.reduce((sum, entry) => sum + (entry.voided_at ? 0 : Math.round(entry.amount * 100)), 0) ?? 0;
  return <section aria-label="Artisan working profile" className="space-y-5 rounded-xl border border-mustard/40 p-4">
    <fieldset disabled={disabled} className="contents">
    <h3 className="font-heading text-xl font-bold">Working profile</h3>
    <p className="text-sm">Private work-related records, not a public profile. Name, phone, location and application skills above come directly from onboarding.</p>
    <div className="space-y-2">
      <h4 className="font-semibold">Private profile photo</h4>
      {application.has_profile_photo ? <>
        <p className="text-xs">Provided with separate photo consent. Not taken from an ID document or permitted for public use.</p>
        {photo ? <><img src={photo} alt={`Private profile of ${application.details.fullName}`} className="max-h-60 max-w-full rounded-xl object-contain" />
          <button type="button" className="min-h-11 underline" onClick={() => setPhoto('')}>Hide profile photo</button></>
          : <button type="button" disabled={busy} className="min-h-11 underline" onClick={() => void run(async () => {
            const source = await readArtisanPhoto(application.id);
            if (document.visibilityState === 'visible') setPhoto(source);
          }, 'Profile photo opened.')}>View profile photo</button>}
        {!confirmPhotoRemoval ? <button type="button" disabled={busy} className="ml-4 min-h-11 underline"
          onClick={() => setConfirmPhotoRemoval(true)}>Remove profile photo</button> : <div className="flex flex-wrap gap-3">
          <p>Remove the profile photo permanently?</p>
          <button type="button" disabled={busy} className="min-h-11 text-red-700 underline" onClick={() => void run(async () => {
            await removeArtisanPhoto(application); setPhoto(''); setConfirmPhotoRemoval(false);
            onUpdated({ ...application, has_profile_photo: false, version: application.version + 1 }); onActivityChanged();
          }, 'Profile photo removed.')}>Confirm photo removal</button>
          <button type="button" disabled={busy} className="min-h-11 underline" onClick={() => setConfirmPhotoRemoval(false)}>Keep photo</button>
        </div>}
      </> : <p className="text-sm">Not provided. Earlier applications did not request a profile photo.</p>}
    </div>
    <form aria-label="Artisan skills" className="space-y-3" onSubmit={event => {
      event.preventDefault();
      void run(async () => { onUpdated(await saveArtisanSkills(application, rating ? Number(rating) : null, capabilities)); onActivityChanged(); }, 'Skills and rating saved.');
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <div className="text-sm font-semibold"><label htmlFor="artisan-skill-rating">Skill rating</label>
        <select id="artisan-skill-rating" value={rating} onChange={event => setRating(event.target.value)} className={inputClass}>
          <option value="">Not rated</option>
          <option value="1">1 - Beginner / needs guidance</option><option value="2">2 - Developing</option>
          <option value="3">3 - Independent</option><option value="4">4 - Skilled</option><option value="5">5 - Advanced</option>
        </select></div>
        <label className="block text-sm font-semibold">Can create / assessed skills<textarea rows={3} maxLength={2000}
          value={capabilities} onChange={event => setCapabilities(event.target.value)} className={inputClass} /></label>
        <p className="text-xs">Starts with the application skills. Add reviewed items such as flowers, bags or amigurumi. Rate demonstrated craft skills only; leave unrated until assessed.</p>
        <button className={buttonClass}>Save skills and rating</button>
      </fieldset>
    </form>
    <section aria-label="Artisan comments" className="space-y-3">
      <h4 className="font-semibold">Comments</h4>
      <form aria-label="Add artisan comment" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          if (commentRequest.current?.signature !== comment) commentRequest.current = { signature: comment, id: crypto.randomUUID() };
          await addArtisanComment(application.id, commentRequest.current.id, comment);
          setComment(''); commentRequest.current = null; refreshActivity();
        }, 'Comment added.');
      }} className="space-y-2">
        <label className="block text-sm">New internal comment<textarea required maxLength={3000} rows={3} disabled={busy}
          value={comment} onChange={event => setComment(event.target.value)} className={inputClass} /></label>
        <p className="text-xs">Work feedback only. Do not enter ID numbers, bank details or sensitive personal information.</p>
        <button disabled={busy || !activity || Boolean(loadError)} className={buttonClass}>Add comment</button>
      </form>
      {activity && <ul className="space-y-2">{activity.comments.map(entry => <li key={entry.id} className="rounded border p-3">
        <p className="text-xs">{new Date(entry.created_at).toLocaleString('en-IN')}</p>
        <p className="whitespace-pre-wrap break-words">{entry.body}</p>
      </li>)}</ul>}
      {activity?.comments.length === 0 && <p className="text-sm">No comments yet.</p>}
    </section>
    <section aria-label="Artisan payments" className="space-y-3">
      <h4 className="font-semibold">Payment entries</h4>
      <p className="text-sm">Record money already paid to this artisan in INR. This does not send money, calculate wages owed or add a business expense automatically. Agree rates and payment terms before work.</p>
      {activity && <p className="font-semibold">Total paid (excluding voided entries): {paymentCurrency.format(totalPaid / 100)}</p>}
      <form aria-label="Record artisan payment" className="space-y-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const signature = JSON.stringify(payment);
          if (paymentRequest.current?.signature !== signature) paymentRequest.current = { signature, id: crypto.randomUUID() };
          await recordArtisanPayment(application.id, paymentRequest.current.id, payment);
          setPayment(emptyPayment()); paymentRequest.current = null; refreshActivity();
        }, 'Payment recorded. No money was sent by this site.');
      }}>
        <fieldset disabled={busy || !activity || Boolean(loadError)} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Payment date<input required type="date" min="2000-01-01" max={localDate()} value={payment.date}
            onChange={event => setPayment(current => ({ ...current, date: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm">Amount paid (INR)<input required type="number" min="0.01" max="10000000" step="0.01"
            value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm">Payment method<select value={payment.method} onChange={event => {
            const method = artisanPaymentMethods.find(value => value === event.target.value);
            if (method) setPayment(current => ({ ...current, method }));
          }} className={inputClass}>{artisanPaymentMethods.map(method => <option key={method}>{method}</option>)}</select></label>
          <label className="text-sm">Transaction reference (optional for cash)<input required={payment.method !== 'Cash'} maxLength={200}
            value={payment.reference} onChange={event => setPayment(current => ({ ...current, reference: event.target.value }))} className={inputClass} /></label>
          <label className="text-sm sm:col-span-2">Work / batch description<textarea required rows={2} maxLength={1000} value={payment.description}
            onChange={event => setPayment(current => ({ ...current, description: event.target.value }))} className={inputClass} /></label>
          <p className="text-xs sm:col-span-2">Use a transaction reference, not a bank account number or UPI address. Entries are retained for accounting; correct a mistake by voiding it with a reason and recording a replacement.</p>
          <button className={`${buttonClass} justify-self-start`}>Record payment</button>
        </fieldset>
      </form>
      {activity?.payments.length === 0 && <p className="text-sm">No payments recorded.</p>}
      {activity && <ul className="space-y-3">{activity.payments.map(entry => <li key={entry.id} className="space-y-1 rounded border p-3 text-sm">
        <p className="font-semibold">{entry.paid_on} - {paymentCurrency.format(entry.amount)} - {entry.method}{entry.voided_at ? ' - Voided' : ''}</p>
        <p className="whitespace-pre-wrap break-words">{entry.description}</p>
        {entry.reference && <p className="break-all">Reference: {entry.reference}</p>}
        {entry.voided_at ? <p className="break-words">Voided {new Date(entry.voided_at).toLocaleString('en-IN')}: {entry.void_reason}</p>
          : <button type="button" disabled={busy} className="min-h-11 text-red-700 underline" onClick={() => { setVoidId(entry.id); setVoidReason(''); }}>Void payment {entry.paid_on} {paymentCurrency.format(entry.amount)}</button>}
      </li>)}</ul>}
      {voidId && <form aria-label="Void artisan payment" className="space-y-2 rounded border border-red-200 p-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => { await voidArtisanPayment(voidId, voidReason); setVoidId(''); setVoidReason(''); refreshActivity(); }, 'Payment voided; original entry retained.');
      }}>
        <label className="block text-sm">Reason for voiding<textarea required rows={2} maxLength={500} value={voidReason}
          disabled={busy} onChange={event => setVoidReason(event.target.value)} className={inputClass} /></label>
        <button disabled={busy} className={buttonClass}>Confirm void payment</button>
        <button type="button" disabled={busy} className="ml-4 min-h-11 underline" onClick={() => setVoidId('')}>Cancel void</button>
      </form>}
    </section>
    {!activity && !loadError && <p role="status">Loading comments and payments...</p>}
    {loadError && <div><p role="alert" className="text-red-700">{loadError}</p><button disabled={busy} className="min-h-11 underline"
      onClick={() => setReloadKey(value => value + 1)}>Retry comments and payments</button></div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    <p className="text-xs">Profiles with payment history cannot be deleted automatically or from this screen. Mark them Inactive when the working relationship ends.</p>
    </fieldset>
  </section>;
}
