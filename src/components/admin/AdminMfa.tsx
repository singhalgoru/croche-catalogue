import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  onVerified: () => Promise<void>;
  onSignOut: () => Promise<void>;
}
export default function AdminMfa({ onVerified, onSignOut }: Props) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (!supabase) return;
    void supabase.auth.mfa.listFactors().then(({ data, error: failure }) => {
      if (!current) return;
      if (failure) setError(`Unable to load authenticators: ${failure.message}`);
      else { setFactors(data.totp); setFactorId(data.totp[0]?.id ?? ''); }
      setBusy(false);
    });
    return () => { current = false; };
  }, []);
  const enroll = async () => {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { data: listed, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      if (listed.totp.length) {
        setFactors(listed.totp); setFactorId(listed.totp[0].id); return;
      }
      for (const factor of listed.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Luvia admin authenticator', issuer: 'Luvia Creations',
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id); setQrCode(data.totp.qr_code);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to set up authenticator.');
    } finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (failure) throw failure;
      setCode(''); setQrCode('');
      await onVerified();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to verify authenticator.');
    } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-cream px-4 py-12">
    <section aria-label="Admin verification" className="mx-auto max-w-md rounded-2xl border border-mustard/40 bg-white p-6 text-cocoa shadow-lg">
      <h1 className="font-heading text-2xl font-bold">Protect your admin account</h1>
      <p className="mt-3 text-sm">Admin access requires an authenticator code, not just your password. Verification lasts 15 minutes; catalogue changes are blocked until you verify again.</p>
      {!factorId && !busy && <div className="mt-4">
        <p className="text-sm">Set up Google Authenticator, Microsoft Authenticator or another TOTP app. Keep a secure backup in your authenticator app. If you lose access, recovery requires the trusted Supabase project administrator; resetting your password does not bypass verification.</p>
        <button type="button" onClick={() => void enroll()} className="mt-4 min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream">Set up authenticator</button>
      </div>}
      {qrCode && <div className="mt-4">
        <p className="text-sm">Scan this QR code in your authenticator app. Do not share it or take a public screenshot.</p>
        <img src={qrCode} alt="Authenticator setup QR code" width="240" height="240" className="mx-auto mt-3 max-w-full" />
      </div>}
      {factorId && <form aria-label="Verify admin authenticator" onSubmit={event => void verify(event)} className="mt-4 space-y-3">
        {factors.length > 1 && <label className="block">Authenticator<select value={factorId} disabled={busy}
          onChange={event => setFactorId(event.target.value)} className="mt-1 min-h-11 w-full rounded border p-2">
          {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}
        </select></label>}
        <label className="block">Six-digit code<input value={code} onChange={event => setCode(event.target.value)}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy}
          className="mt-1 min-h-11 w-full rounded border p-2" /></label>
        <button disabled={busy} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">{busy ? 'Verifying...' : 'Verify and continue'}</button>
      </form>}
      {busy && !factorId && <p role="status" className="mt-4">Loading authenticators...</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void onSignOut()} className="mt-4 min-h-11 text-sm underline">Sign out</button>
    </section>
  </main>;
}
