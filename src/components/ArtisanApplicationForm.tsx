import { useCallback, useEffect, useRef, useState } from 'react';
import content from '../content/artisanOnboarding.json';
import { checkArtisanInvitation, emptyArtisanDetails, submitArtisanApplication } from '../services/artisans';

export default function ArtisanApplicationForm() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '');
  const [invitation, setInvitation] = useState<'checking' | 'available' | 'submitted' | 'unavailable'>(() => /^[a-f0-9]{64}$/.test(token) ? 'checking' : 'unavailable');
  const [checkKey, setCheckKey] = useState(0);
  const [details, setDetails] = useState({ ...emptyArtisanDetails });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const request = useRef<{ signature: string; id: string } | null>(null);
  const focusConfirmation = useCallback((element: HTMLHeadingElement | null) => element?.focus(), []);
  useEffect(() => {
    const changeInvitation = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '';
      setToken(next); setInvitation(/^[a-f0-9]{64}$/.test(next) ? 'checking' : 'unavailable');
      setError(''); setReceipt(''); setDetails({ ...emptyArtisanDetails }); request.current = null;
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
      const signature = JSON.stringify(details);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      void submitArtisanApplication(details, request.current.id, token).then(id => {
        setReceipt(id); setDetails({ ...emptyArtisanDetails }); request.current = null;
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }).catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to save your application. Retry without changing your details.'))
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
