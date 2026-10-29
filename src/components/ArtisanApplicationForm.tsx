import { useCallback, useEffect, useRef, useState } from 'react';
import content from '../content/artisanOnboarding.json';
import { checkArtisanInvitation, emptyArtisanDetails, prepareArtisanIdentity, submitArtisanApplication } from '../services/artisans';
import type { ArtisanIdentityUpload } from '../services/artisans';
import { getWhatsAppNumber } from '../utils/whatsapp';

export default function ArtisanApplicationForm() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '');
  const [invitation, setInvitation] = useState<'checking' | 'available' | 'submitted' | 'unavailable'>(() => /^[a-f0-9]{64}$/.test(token) ? 'checking' : 'unavailable');
  const [checkKey, setCheckKey] = useState(0);
  const [details, setDetails] = useState({ ...emptyArtisanDetails });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [dispatchAcknowledged, setDispatchAcknowledged] = useState(false);
  const [identityType, setIdentityType] = useState<ArtisanIdentityUpload['documentType']>('masked_aadhaar');
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [identityConsent, setIdentityConsent] = useState(false);
  const [preparedIdentity, setPreparedIdentity] = useState<ArtisanIdentityUpload | null>(null);
  const identityInput = useRef<HTMLInputElement>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const focusConfirmation = useCallback((element: HTMLHeadingElement | null) => element?.focus(), []);
  useEffect(() => {
    const changeInvitation = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '';
      setToken(next); setInvitation(/^[a-f0-9]{64}$/.test(next) ? 'checking' : 'unavailable');
      setError(''); setReceipt(''); setDetails({ ...emptyArtisanDetails }); request.current = null;
      setDispatchAcknowledged(false); setIdentityFile(null); setIdentityConsent(false); setPreparedIdentity(null);
    };
    window.addEventListener('hashchange', changeInvitation);
    return () => window.removeEventListener('hashchange', changeInvitation);
  }, []);
  useEffect(() => {
    let current = true;
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    void checkArtisanInvitation(token).then(value => {
      if (current) setInvitation(value);
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to check invitation.');
    });
    return () => { current = false; };
  }, [token, checkKey]);

  if (receipt) return <section className="max-w-3xl space-y-3 rounded-2xl bg-white p-5" aria-label="Application confirmation">
    <h2 className="font-heading text-2xl font-bold" tabIndex={-1} ref={focusConfirmation}>Thank you for introducing yourself</h2>
    <p role="status">Your application has been saved. Your reference is <strong className="break-all">{receipt}</strong>.</p>
    <p>Keep this reference. Luvia will review your application and contact you if there is a suitable next step. Work is not guaranteed.</p>
    <section aria-labelledby="artisan-work-video-heading" className="space-y-3 rounded-xl bg-cream p-4">
      <h3 id="artisan-work-video-heading" className="font-semibold">Show us your craft (optional)</h3>
      <p>If possible, send a short 30-60 second video of your own crochet or handmade work on WhatsApp. Show a finished piece or a few stitches being made; there is no need to show your face.</p>
      <p className="text-sm">Your application is already saved. A video is not required; you can discuss a paid trial instead. Do not include identity documents, personal details or other people. We will use it for application review only, not publish it without separate permission.</p>
      <a href={`https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(`Hi Luvia, I have submitted my artisan application.\nApplication reference: ${receipt}\nI would like to share a short video of my own craft work for application review.`)}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">
        Share work video on WhatsApp
      </a>
      <p className="text-sm">This opens a message draft. Attach your video in WhatsApp and press Send; nothing is sent automatically.</p>
    </section>
    <p>Corrections or privacy requests: <a href="mailto:hello@luviacreations.com" className="underline">hello@luviacreations.com</a>.</p>
  </section>;
  if (invitation !== 'available') return <section className="max-w-3xl space-y-3 rounded-2xl bg-white p-5">
    {error ? <><p role="alert" className="text-red-700">{error}</p><button className="min-h-11 underline" onClick={() => { setError(''); setInvitation('checking'); setCheckKey(key => key + 1); }}>Retry invitation check</button></>
      : invitation === 'checking' ? <p role="status">Checking your invitation...</p>
        : <p role="status">{invitation === 'submitted' ? 'This invitation has already been submitted. Contact Luvia for corrections; do not submit another application.'
          : 'Applications are by invitation. This link is missing, expired or unavailable. Contact Luvia for a new private invitation.'}</p>}
    <a className="inline-flex min-h-11 items-center underline" href="mailto:hello@luviacreations.com">Contact Luvia</a>
  </section>;
  return <section className="max-w-3xl space-y-4 rounded-2xl border border-mustard/40 bg-white p-4 sm:p-6">
    <p>{content.description}</p><p>{content.notice}</p>
    <p className="text-sm">No portfolio is required. You can discuss a paid trial instead. Keep your invitation private.</p>
    <form aria-label="Artisan application" className="grid gap-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void (async () => {
        if (!dispatchAcknowledged) throw new Error('Read and acknowledge the material dispatch and courier charge terms.');
        if (identityFile && !identityConsent) throw new Error('Confirm the ID is masked and consent to private identity review, or remove the file.');
        const identity = identityFile ? preparedIdentity ?? await prepareArtisanIdentity(identityFile, identityType) : null;
        if (identity) setPreparedIdentity(identity);
        const signature = JSON.stringify({ details, dispatchAcknowledged, identity });
        if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
        const id = await submitArtisanApplication(details, request.current.id, token, dispatchAcknowledged, identity);
        setReceipt(id); setDetails({ ...emptyArtisanDetails }); setIdentityFile(null); setPreparedIdentity(null);
        setIdentityConsent(false); request.current = null;
        window.history.replaceState(window.history.state, '', window.location.pathname);
      })().catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to save your application. Retry without changing your details.'))
        .finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="contents">
      {content.fields.map(field => <label key={field.name} className={`block text-sm ${['skills', 'availability', 'tools', 'notes'].includes(field.name) ? 'sm:col-span-2' : ''}`}>
        <span className="font-semibold">{field.label}{field.required ? ' *' : ''}</span>
        {field.maxLength >= 500 && field.name !== 'portfolioUrl'
          ? <textarea name={field.name} required={field.required} maxLength={field.maxLength} rows={3}
              value={String(Reflect.get(details, field.name))}
              onChange={event => setDetails(current => ({ ...current, [field.name]: event.target.value }))}
              className="mt-1 block w-full rounded-lg border border-cocoa/30 p-3" />
          : <input name={field.name} required={field.required} maxLength={field.maxLength} autoComplete={field.autocomplete}
              type={field.name === 'mobile' ? 'tel' : field.name === 'portfolioUrl' ? 'url' : 'text'}
              inputMode={field.name === 'pin' ? 'numeric' : undefined}
              value={String(Reflect.get(details, field.name))}
              onChange={event => setDetails(current => ({ ...current, [field.name]: event.target.value }))}
              className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/30 p-3" />}
      </label>)}
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" checked={details.paidTrial}
        onChange={event => setDetails(current => ({ ...current, paidTrial: event.target.checked }))} />I am interested in a small paid sample or trial (optional).</label>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" required checked={details.adult}
        onChange={event => setDetails(current => ({ ...current, adult: event.target.checked }))} />I confirm I am 18 or older. *</label>
      <section aria-labelledby="artisan-id-heading" className="space-y-3 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-id-heading" className="font-semibold">One identity document (optional)</h2>
        <p>Upload a masked Aadhaar or an alternative government ID photo for private manual review. Aadhaar is not mandatory; you can arrange alternative verification with Luvia.</p>
        <p>Before uploading, permanently cover the first 8 Aadhaar digits, QR/barcodes, address and unrelated details. Leave only your name, photo and last 4 digits visible. For other IDs, cover the document number except its last 4 digits and unrelated details. The website does not automatically mask or verify your ID. Never provide an OTP or full Aadhaar number.</p>
        <label className="block">ID type<select value={identityType} onChange={event => {
          if (event.target.value === 'masked_aadhaar' || event.target.value === 'alternative_id') {
            setIdentityType(event.target.value); setPreparedIdentity(null); setIdentityConsent(false);
          }
        }} className="mt-1 block min-h-11 w-full rounded border p-2">
          <option value="masked_aadhaar">Masked Aadhaar</option><option value="alternative_id">Alternative government ID</option>
        </select></label>
        <label className="block">Masked ID photo (JPG, PNG or WebP; up to 5 MB)<input ref={identityInput} key={token} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={event => { setIdentityFile(event.target.files?.[0] ?? null); setPreparedIdentity(null); setIdentityConsent(false); }}
          className="mt-1 block min-h-11 w-full max-w-full rounded border p-2" /></label>
        {identityFile && <button type="button" className="min-h-11 underline" onClick={() => {
          setIdentityFile(null); setPreparedIdentity(null); setIdentityConsent(false);
          if (identityInput.current) identityInput.current.value = '';
        }}>Remove selected ID photo</button>}
        {identityFile && <label className="flex min-h-11 items-start gap-3"><input type="checkbox" required checked={identityConsent} className="mt-1"
          onChange={event => setIdentityConsent(event.target.checked)} />
          I have permanently masked the details described above and consent to private storage and manual ID review. The image is accessible for at most 30 days and deleted by the next hourly cleanup, or earlier after review; private backups may retain it longer.</label>}
        <p className="text-xs">The prepared image is stored privately in the database, not on a public image host. Do not put an ID image in your portfolio link.</p>
      </section>
      <section aria-labelledby="artisan-dispatch-heading" className="space-y-2 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-dispatch-heading" className="font-semibold">{content.dispatchTermsTitle}</h2>
        {content.dispatchTerms.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </section>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" required checked={dispatchAcknowledged} className="mt-1"
        onChange={event => setDispatchAcknowledged(event.target.checked)} />
        I have read and acknowledge the material dispatch and courier charge terms. The actual courier estimate must be separately agreed before dispatch. *</label>
      <section aria-labelledby="artisan-privacy-heading" className="space-y-2 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-privacy-heading" className="font-semibold">Application privacy notice</h2><p>{content.privacy}</p>
        <a href="/privacy-policy/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Read the Privacy Policy</a>
      </section>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" required checked={details.consent}
        onChange={event => setDetails(current => ({ ...current, consent: event.target.checked }))} />
        I confirm my details are accurate and agree to their use for reviewing this application and contacting me as described above. *</label>
      </fieldset>
      {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <button disabled={busy} className="min-h-11 justify-self-start rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50">
        {busy ? 'Saving application...' : 'Submit application'}
      </button>
    </form>
  </section>;
}
