import { useEffect, useRef, useState } from 'react';
import { createArtisanInvitation, fetchArtisanInvitations, revokeArtisanInvitation } from '../../services/artisans';
import type { ArtisanInvitation, InvitationInput } from '../../services/artisans';

export default function ArtisanInvitations() {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ link: string; message: string; whatsapp: string | null } | null>(null);
  const [invitations, setInvitations] = useState<ArtisanInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [revokeId, setRevokeId] = useState('');
  const [now, setNow] = useState(Date.now);
  const request = useRef<{ signature: string; input: InvitationInput } | null>(null);
  const refreshInvitations = () => { setLoading(true); setLoadError(''); setRefresh(value => value + 1); };
  useEffect(() => {
    let current = true;
    void fetchArtisanInvitations().then(rows => {
      if (current) { setInvitations(rows); setNow(Date.now()); }
    }).catch(failure => {
      if (current) setLoadError(failure instanceof Error ? failure.message : 'Unable to load invitations.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh]);
  return <section aria-labelledby="artisan-invitations-title" className="space-y-4 rounded-2xl bg-white p-4 text-cocoa shadow-sm sm:p-6">
    <h2 id="artisan-invitations-title" className="font-heading text-2xl font-bold">Invite an artisan</h2>
    <p className="text-sm">Create a private application link that expires 24 hours after creation or after one submission, whichever comes first. Email invitations come from onboarding@luviacreations.com; replies go to hello@luviacreations.com. WhatsApp messages must be sent manually.</p>
    <form aria-label="Invite artisan" className="grid gap-3 sm:grid-cols-3" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError(''); setResult(null);
      const signature = JSON.stringify({ name, channel, contact });
      if (request.current?.signature !== signature) {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        request.current = { signature, input: { id: crypto.randomUUID(), token, name, channel, contact } };
      }
      void createArtisanInvitation(request.current.input).then(receipt => {
        const digits = contact.replace(/\D/g, '');
        const phone = digits.length === 10 ? `91${digits}` : digits;
        const message = `Hello ${name.trim()}, Luvia Creations invites you to complete your private artisan application: ${receipt.link}\nThis link expires 24 hours after creation or after one submission, whichever comes first. Please keep it private. There is no application fee or trial deposit. Agreed material-delivery courier charges are separate and require your acceptance before dispatch. Applying does not guarantee work.`;
        setResult({ ...receipt, whatsapp: channel === 'whatsapp' ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null });
        refreshInvitations();
      }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to create invitation. Retry the same invitation.'))
        .finally(() => setBusy(false));
    }}>
      <label className="text-sm">Artisan name<input required maxLength={100} disabled={busy} value={name}
        onChange={event => { setName(event.target.value); setResult(null); }}
        className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      <label className="text-sm">Send using<select disabled={busy} value={channel} onChange={event => {
        if (event.target.value === 'email' || event.target.value === 'whatsapp') {
          setChannel(event.target.value); setContact(''); setResult(null);
        }
      }} className="mt-1 block min-h-11 w-full rounded border p-2"><option value="email">Email</option><option value="whatsapp">WhatsApp link</option></select></label>
      <label className="text-sm">{channel === 'email' ? 'Artisan email' : 'Artisan WhatsApp number'}<input required
        type={channel === 'email' ? 'email' : 'tel'} maxLength={channel === 'email' ? 254 : 20} disabled={busy} value={contact}
        onChange={event => { setContact(event.target.value); setResult(null); }}
        className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{error}</p>}
      <button disabled={busy} className="min-h-11 justify-self-start rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">
        {busy ? 'Preparing invitation...' : channel === 'email' ? 'Send invitation email' : 'Create WhatsApp invitation'}
      </button>
    </form>
    {result && <div className="space-y-2 rounded-xl bg-cream p-4">
      <p role="status">{result.message}</p>
      <label className="block text-sm">Private application link<input readOnly value={result.link}
        onFocus={event => event.target.select()} className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      {result.whatsapp && <a target="_blank" rel="noopener noreferrer" href={result.whatsapp}
        className="inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-2 font-semibold text-cream">Open WhatsApp to send</a>}
      <p className="text-xs">Do not publish this link. If you lose it, revoke the invitation below and create a replacement.</p>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Latest 25 invitations</h3>
      <button disabled={busy || loading} onClick={refreshInvitations} className="min-h-11 underline">Refresh invitations</button></div>
    {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
    {loading ? <p role="status">Loading invitations...</p> : !loadError && <ul className="space-y-2">
      {invitations.length === 0 && <li>No invitations yet.</li>}
      {invitations.map(invite => {
        const status = invite.revoked_at ? 'Revoked' : invite.submitted_at ? 'Application submitted'
          : Date.parse(invite.expires_at) <= now ? 'Expired'
            : invite.email_accepted_at ? 'Email accepted by provider' : invite.channel === 'email' ? 'Email not confirmed' : 'Link created; send manually';
        return <li key={invite.id} className="rounded-xl border border-mustard/40 p-3 text-sm">
          <p className="break-words font-semibold">{invite.recipient_name} — {invite.contact}</p>
          <p>{status} · Expires {new Date(invite.expires_at).toLocaleString('en-IN')}</p>
          {!invite.revoked_at && !invite.submitted_at && Date.parse(invite.expires_at) > now && <>
            {revokeId !== invite.id ? <button disabled={busy} className="min-h-11 underline" onClick={() => setRevokeId(invite.id)}>Revoke invitation</button>
              : <div className="flex flex-wrap items-center gap-3"><span>Disable this application link?</span>
                <button disabled={busy} className="min-h-11 text-red-700 underline" onClick={() => {
                  setBusy(true); setError('');
                  void revokeArtisanInvitation(invite.id).then(() => {
                    if (request.current?.input.id === invite.id) setResult(null);
                    setRevokeId(''); refreshInvitations();
                  }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to revoke invitation.'))
                    .finally(() => setBusy(false));
                }}>Confirm revoke</button><button disabled={busy} className="min-h-11 underline" onClick={() => setRevokeId('')}>Cancel</button></div>}
          </>}
        </li>;
      })}
    </ul>}
  </section>;
}
