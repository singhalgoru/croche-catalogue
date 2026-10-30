import { useCallback, useEffect, useRef, useState } from 'react';
import englishContent from '../content/artisanOnboarding.json';
import { hindiContent, hindiText } from '../content/artisanOnboardingHindi';
import { checkArtisanInvitation, emptyArtisanDetails, prepareArtisanIdentity, prepareArtisanProfilePhoto, submitArtisanApplication } from '../services/artisans';
import type { ArtisanIdentityUpload, ArtisanProfilePhoto } from '../services/artisans';
import { getWhatsAppNumber } from '../utils/whatsapp';

export default function ArtisanApplicationForm() {
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const content = language === 'hi' ? hindiContent : englishContent;
  const t = (text: string) => language === 'hi' ? hindiText[text] ?? text : text;
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [preparedPhoto, setPreparedPhoto] = useState<ArtisanProfilePhoto | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const focusConfirmation = useCallback((element: HTMLHeadingElement | null) => element?.focus(), []);
  useEffect(() => {
    const changeInvitation = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '';
      setToken(next); setInvitation(/^[a-f0-9]{64}$/.test(next) ? 'checking' : 'unavailable');
      setError(''); setReceipt(''); setDetails({ ...emptyArtisanDetails }); request.current = null;
      setDispatchAcknowledged(false); setIdentityFile(null); setIdentityConsent(false); setPreparedIdentity(null);
      setPhotoFile(null); setPhotoConsent(false); setPreparedPhoto(null);
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

  if (receipt) return <section lang={language} className="max-w-3xl space-y-3 rounded-2xl bg-white p-5" aria-label={t('Application confirmation')}>
    <h2 className="font-heading text-2xl font-bold" tabIndex={-1} ref={focusConfirmation}>{t('Thank you for introducing yourself')}</h2>
    <p role="status">{t('Your application has been saved. Your reference is')} <strong className="break-all">{receipt}</strong>.</p>
    <p>{t('Keep this reference. Luvia will review your application and contact you if there is a suitable next step. Work is not guaranteed.')}</p>
    <section aria-labelledby="artisan-work-video-heading" className="space-y-3 rounded-xl bg-cream p-4">
      <h3 id="artisan-work-video-heading" className="font-semibold">{t('Show us your craft (optional)')}</h3>
      <p>{t('If possible, send a short 30-60 second video of your own crochet or handmade work on WhatsApp. Show a finished piece or a few stitches being made; there is no need to show your face.')}</p>
      <p className="text-sm">{t('Your application is already saved. A video is not required; you can discuss a paid trial instead. Do not include identity documents, personal details or other people. We will use it for application review only, not publish it without separate permission.')}</p>
      <a href={`https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(`Hi Luvia, I have submitted my artisan application.\nApplication reference: ${receipt}\nI would like to share a short video of my own craft work for application review.`)}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-cocoa px-5 py-3 font-semibold text-cream">
        {t('Share work video on WhatsApp')}
      </a>
      <p className="text-sm">{t('This opens a message draft. Attach your video in WhatsApp and press Send; nothing is sent automatically.')}</p>
    </section>
    <p>{t('Corrections or privacy requests:')} <a href="mailto:hello@luviacreations.com" className="underline">hello@luviacreations.com</a>.</p>
  </section>;
  const languagePicker = <label className="block text-sm font-semibold">Form language / फॉर्म की भाषा
    <select value={language} disabled={busy} onChange={event => {
      if (event.target.value === 'en' || event.target.value === 'hi') setLanguage(event.target.value);
    }} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/30 p-3">
      <option value="en">English</option><option value="hi">हिन्दी</option>
    </select>
  </label>;
  if (invitation !== 'available') return <section lang={language} className="max-w-3xl space-y-3 rounded-2xl bg-white p-5">
    {languagePicker}
    {error ? <><p role="alert" className="text-red-700">{error}</p><button className="min-h-11 underline" onClick={() => { setError(''); setInvitation('checking'); setCheckKey(key => key + 1); }}>{t('Retry invitation check')}</button></>
      : invitation === 'checking' ? <p role="status">{t('Checking your invitation...')}</p>
        : <p role="status">{t(invitation === 'submitted' ? 'This invitation has already been submitted. Contact Luvia for corrections; do not submit another application.'
          : 'Applications are by invitation. This link is missing, expired or unavailable. Contact Luvia for a new private invitation.')}</p>}
    <a className="inline-flex min-h-11 items-center underline" href="mailto:hello@luviacreations.com">{t('Contact Luvia')}</a>
  </section>;
  return <section lang={language} className="max-w-3xl space-y-4 rounded-2xl border border-mustard/40 bg-white p-4 sm:p-6">
    {languagePicker}
    <p className="text-sm">{language === 'hi'
      ? 'उत्तर हिन्दी या अंग्रेज़ी में दे सकते हैं। जानकारी उसी भाषा में सहेजी जाएगी, अनुवाद नहीं होगा। नीचे अपनी पसंदीदा संपर्क भाषा और समय बताएं।'
      : 'You can answer in Hindi or English. Answers are saved in their original language without translation. Tell us your preferred contact language and time below.'}</p>
    <p>{content.description}</p><p>{content.notice}</p>
    <p className="text-sm">{t('No portfolio is required. You can discuss a paid trial instead. Keep your invitation private.')}</p>
    <form aria-label={t('Artisan application')} className="grid gap-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void (async () => {
        if (!dispatchAcknowledged) throw new Error(t('Read and acknowledge the material dispatch and courier charge terms.'));
        if (identityFile && !identityConsent) throw new Error(t('Confirm the ID is masked and consent to private identity review, or remove the file.'));
        const identity = identityFile ? preparedIdentity ?? await prepareArtisanIdentity(identityFile, identityType) : null;
        if (identity) setPreparedIdentity(identity);
        if (photoFile && !photoConsent) throw new Error(t('Consent to private profile-photo storage or remove the photo.'));
        const photo = photoFile ? preparedPhoto ?? await prepareArtisanProfilePhoto(photoFile) : null;
        if (photo) setPreparedPhoto(photo);
        const signature = JSON.stringify({ details, dispatchAcknowledged, identity, photo });
        if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
        const id = await submitArtisanApplication(details, request.current.id, token, dispatchAcknowledged, identity, photo);
        setReceipt(id); setDetails({ ...emptyArtisanDetails }); setIdentityFile(null); setPreparedIdentity(null);
        setIdentityConsent(false); request.current = null;
        setPhotoFile(null); setPhotoConsent(false); setPreparedPhoto(null);
        window.history.replaceState(window.history.state, '', window.location.pathname);
      })().catch(failure => {
        const message = failure instanceof Error ? failure.message : 'Unable to save your application. Retry without changing your details.';
        setError(language === 'hi' ? `आवेदन सहेजा नहीं जा सका। जानकारी जांचकर फिर कोशिश करें। ${t(message)}` : message);
      })
        .finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="contents">
      {content.fields.map(field => <div key={field.name} className={`block text-sm ${['skills', 'availability', 'tools', 'notes'].includes(field.name) ? 'sm:col-span-2' : ''}`}>
        <label htmlFor={`artisan-${field.name}`} title={field.hint} className="font-semibold">{field.label}{field.required ? ' *' : ''}</label>
        {field.hint && <p id={`artisan-${field.name}-hint`} className="mt-1 text-xs">{field.hint}</p>}
        {field.maxLength >= 500 && field.name !== 'portfolioUrl'
          ? <textarea id={`artisan-${field.name}`} title={field.hint} aria-describedby={field.hint ? `artisan-${field.name}-hint` : undefined}
              name={field.name} required={field.required} maxLength={field.maxLength} rows={3}
              value={String(Reflect.get(details, field.name) ?? '')}
              onChange={event => setDetails(current => ({ ...current, [field.name]: event.target.value }))}
              className="mt-1 block w-full rounded-lg border border-cocoa/30 p-3" />
          : <input id={`artisan-${field.name}`} title={field.hint} aria-describedby={field.hint ? `artisan-${field.name}-hint` : undefined}
              name={field.name} required={field.required} maxLength={field.maxLength} autoComplete={field.autocomplete}
              type={field.name === 'mobile' ? 'tel' : field.name === 'portfolioUrl' ? 'url' : 'text'}
              inputMode={field.name === 'pin' ? 'numeric' : undefined}
              value={String(Reflect.get(details, field.name) ?? '')}
              onChange={event => setDetails(current => ({ ...current, [field.name]: event.target.value }))}
              className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/30 p-3" />}
      </div>)}
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" checked={details.paidTrial}
        onChange={event => setDetails(current => ({ ...current, paidTrial: event.target.checked }))} />{t('I am interested in a small paid sample or trial (optional).')}</label>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" required checked={details.adult}
        onChange={event => setDetails(current => ({ ...current, adult: event.target.checked }))} />{t('I confirm I am 18 or older. *')}</label>
      <section aria-label={t('Optional private profile photo')} className="space-y-3 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 className="font-semibold">{t('Profile photo (optional)')}</h2>
        <p>{t('A photo of yourself helps authorised Luvia admins recognise your private artisan profile. It is not an ID document or required for selection. Do not upload other people or identity documents.')}</p>
        <label className="block">{t('Profile photo (JPG, PNG or WebP; up to 5 MB)')}<input ref={photoInput} key={token} type="file"
          accept="image/jpeg,image/png,image/webp" className="mt-1 block min-h-11 w-full max-w-full rounded border p-2"
          onChange={event => { setPhotoFile(event.target.files?.[0] ?? null); setPreparedPhoto(null); setPhotoConsent(false); }} /></label>
        {photoFile && <>
          <button type="button" className="min-h-11 underline" onClick={() => {
            setPhotoFile(null); setPreparedPhoto(null); setPhotoConsent(false);
            if (photoInput.current) photoInput.current.value = '';
          }}>{t('Remove selected profile photo')}</button>
          <label className="flex min-h-11 items-start gap-3"><input type="checkbox" required checked={photoConsent} className="mt-1"
            onChange={event => setPhotoConsent(event.target.checked)} />
            {t('I consent to private database storage of my profile photo for application review and our working relationship, not public use. I can request removal at hello@luviacreations.com. It is deleted with my application or earlier on request; private backups may retain it longer.')}</label>
        </>}
        <p className="text-xs">{t('Photo consent version 2026-10-30.1. The photo is never copied from your identity document.')}</p>
      </section>
      <section aria-labelledby="artisan-id-heading" className="space-y-3 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-id-heading" className="font-semibold">{t('One identity document (optional)')}</h2>
        <p>{t('Upload a masked Aadhaar or an alternative government ID photo for private manual review. Aadhaar is not mandatory; you can arrange alternative verification with Luvia.')}</p>
        <p>{t('Before uploading, permanently cover the first 8 Aadhaar digits, QR/barcodes, address and unrelated details. Leave only your name, photo and last 4 digits visible. For other IDs, cover the document number except its last 4 digits and unrelated details. The website does not automatically mask or verify your ID. Never provide an OTP or full Aadhaar number.')}</p>
        <label className="block">{t('ID type')}<select value={identityType} onChange={event => {
          if (event.target.value === 'masked_aadhaar' || event.target.value === 'alternative_id') {
            setIdentityType(event.target.value); setPreparedIdentity(null); setIdentityConsent(false);
          }
        }} className="mt-1 block min-h-11 w-full rounded border p-2">
          <option value="masked_aadhaar">{t('Masked Aadhaar')}</option><option value="alternative_id">{t('Alternative government ID')}</option>
        </select></label>
        <label className="block">{t('Masked ID photo (JPG, PNG or WebP; up to 5 MB)')}<input ref={identityInput} key={token} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={event => { setIdentityFile(event.target.files?.[0] ?? null); setPreparedIdentity(null); setIdentityConsent(false); }}
          className="mt-1 block min-h-11 w-full max-w-full rounded border p-2" /></label>
        {identityFile && <button type="button" className="min-h-11 underline" onClick={() => {
          setIdentityFile(null); setPreparedIdentity(null); setIdentityConsent(false);
          if (identityInput.current) identityInput.current.value = '';
        }}>{t('Remove selected ID photo')}</button>}
        {identityFile && <label className="flex min-h-11 items-start gap-3"><input type="checkbox" required checked={identityConsent} className="mt-1"
          onChange={event => setIdentityConsent(event.target.checked)} />
          {t('I have permanently masked the details described above and consent to private storage and manual ID review. The image is accessible for at most 30 days and deleted by the next hourly cleanup, or earlier after review; private backups may retain it longer.')}</label>}
        <p className="text-xs">{t('The prepared image is stored privately in the database, not on a public image host. Do not put an ID image in your portfolio link.')}</p>
      </section>
      <section aria-labelledby="artisan-dispatch-heading" className="space-y-2 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-dispatch-heading" className="font-semibold">{content.dispatchTermsTitle}</h2>
        {content.dispatchTerms.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </section>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" required checked={dispatchAcknowledged} className="mt-1"
        onChange={event => setDispatchAcknowledged(event.target.checked)} />
        {t('I have read and acknowledge the material dispatch and courier charge terms. The actual courier estimate must be separately agreed before dispatch. *')}</label>
      <section aria-labelledby="artisan-privacy-heading" className="space-y-2 rounded-xl bg-cream p-4 text-sm sm:col-span-2">
        <h2 id="artisan-privacy-heading" className="font-semibold">{t('Application privacy notice')}</h2><p>{content.privacy}</p><p>{content.profilePrivacy}</p>
        <a href="/privacy-policy/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{t('Read the Privacy Policy')}</a>
      </section>
      <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" required checked={details.consent}
        onChange={event => setDetails(current => ({ ...current, consent: event.target.checked }))} />
        {t('I confirm my details are accurate and agree to their use for reviewing this application and contacting me as described above. *')}</label>
      </fieldset>
      {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <button disabled={busy} className="min-h-11 justify-self-start rounded-full bg-cocoa px-5 py-3 font-semibold text-cream disabled:opacity-50">
        {t(busy ? 'Saving application...' : 'Submit application')}
      </button>
    </form>
  </section>;
}
