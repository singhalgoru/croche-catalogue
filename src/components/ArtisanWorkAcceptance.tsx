import { useEffect, useState } from 'react';
import { acceptWorkAssignment, readWorkAssignment } from '../services/artisanWork';
import type { WorkOffer } from '../../supabase/functions/_shared/artisanWorkEmail';

export default function ArtisanWorkAcceptance() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('work') ?? '');
  const [assignment, setAssignment] = useState<{ offer: WorkOffer; acceptedAt: string | null; completedAt: string | null; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!/^[a-f0-9]{64}$/.test(token)) { setError('Invalid assignment link. Contact Luvia.'); return; }
    void readWorkAssignment(token).then(value => { if (active) setAssignment(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load assignment.'); });
    return () => { active = false; };
  }, [token]);
  return <section className="max-w-3xl space-y-4 rounded-xl bg-white p-5">
    <h1 className="font-heading text-2xl font-bold">Your Luvia work assignment</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!assignment && !error && <p role="status">Loading assignment...</p>}
    {assignment && <>
      <p>Hello {assignment.offer.recipientName},</p>
      <p className="whitespace-pre-wrap">{assignment.offer.message}</p>
      <ul className="space-y-3">{assignment.offer.items.map((item, index) => <li key={index} className="rounded border border-mustard/40 p-3">
        <strong>{item.name}</strong> — {item.quantity} units<br />
        Including yarn: INR {item.rateWithYarn.toFixed(2)} per unit<br />
        Excluding yarn: INR {item.rateWithoutYarn.toFixed(2)} per unit
        {item.patternFilename && <><br />Pattern attached to email: {item.patternFilename}</>}
      </li>)}</ul>
      <p>Delivery date: <strong>{assignment.offer.deliveryDate}</strong><br />
        Maximum courier reimbursement: <strong>INR {assignment.offer.courierCap.toFixed(2)}</strong></p>
      {assignment.acceptedAt ? <p role="status">{assignment.completedAt ? 'This assignment is completed.' : 'You accepted this assignment. Work is in progress.'}</p>
        : <form className="space-y-3" onSubmit={event => {
          event.preventDefault(); setBusy(true); setError('');
          void acceptWorkAssignment(token).then(() => setAssignment(current => current ? { ...current, acceptedAt: new Date().toISOString() } : current))
            .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to accept assignment. Retry the same link.'))
            .finally(() => setBusy(false));
        }}>
          <p>Review the terms above and contact Luvia with any questions before accepting. This link expires {new Date(assignment.expiresAt).toLocaleDateString('en-IN')}.</p>
          <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            I accept these work assignment terms.</label>
          <button disabled={busy} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">
            {busy ? 'Accepting...' : 'Accept assignment'}
          </button>
        </form>}
    </>}
  </section>;
}
