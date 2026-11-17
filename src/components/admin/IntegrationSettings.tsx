import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchAdminSiteIntegrations,
  saveAdminSiteIntegrations,
  type SiteIntegrations,
} from '../../services/siteIntegrations';

export default function IntegrationSettings() {
  const [settings, setSettings] = useState<SiteIntegrations | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void fetchAdminSiteIntegrations().then(value => {
      if (active) setSettings(value);
    }, loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load site integrations.');
    });
    return () => { active = false; };
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSettings(await saveAdminSiteIntegrations(settings));
      setMessage('Settings saved. Tracking changes apply on the next page load; generated product pages update after the site rebuild completes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save site integrations.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
    <h2 className="font-heading text-2xl font-bold">Site integrations</h2>
    <p className="mt-2 text-sm text-cocoa/70">
      Manage public tracking IDs and the WhatsApp contact number used across the storefront.
      Leave a tracking ID blank to disable that integration.
    </p>
    {settings && <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => void save(event)}>
      <label className="text-sm font-semibold">
        WhatsApp contact number
        <input type="tel" inputMode="tel" autoComplete="tel" required maxLength={24}
          value={settings.whatsappNumber} disabled={busy}
          onChange={event => setSettings({ ...settings, whatsappNumber: event.target.value })}
          aria-describedby="site-integration-whatsapp-help"
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2" />
        <span id="site-integration-whatsapp-help" className="mt-1 block font-normal text-cocoa/65">
          Include country code, digits only (for example 919876543210).
        </span>
      </label>
      <label className="text-sm font-semibold">
        Google Analytics 4 measurement ID
        <input type="text" autoCapitalize="characters" maxLength={24} placeholder="G-XXXXXXXXXX"
          value={settings.googleAnalyticsMeasurementId} disabled={busy}
          onChange={event => setSettings({ ...settings, googleAnalyticsMeasurementId: event.target.value })}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2" />
      </label>
      <label className="text-sm font-semibold sm:col-span-2">
        Meta Pixel ID
        <input type="text" inputMode="numeric" maxLength={30} placeholder="Numeric Pixel ID"
          value={settings.metaPixelId} disabled={busy}
          onChange={event => setSettings({ ...settings, metaPixelId: event.target.value })}
          className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2" />
      </label>
      <button type="submit" disabled={busy}
        className="min-h-11 justify-self-start rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-60">
        {busy ? 'Saving…' : 'Save site integrations'}
      </button>
    </form>}
    {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 rounded-xl bg-cream/70 p-4 text-sm text-cocoa/75">
      <h3 className="font-semibold text-cocoa">Managed during deployment</h3>
      <p className="mt-1">
        CAPTCHA site keys stay paired with their server-side secrets. Supabase connection settings,
        payment credentials, API tokens, and storage credentials are not editable here.
      </p>
    </div>
  </section>;
}
