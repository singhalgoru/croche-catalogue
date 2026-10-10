import { useEffect, useState } from 'react';
import { loadSupabase } from '../lib/supabaseConfig';
import { fetchCustomerAccount, registerCustomerEmail, confirmCustomerEmail, sendCustomerSignIn,
  fetchWelcomeOffer, emailWelcomeCoupon, signOutCustomer } from '../services/customer';
import type { WelcomeCoupon, WelcomeOffer } from '../types/customer';

interface Props {
  initialEmail?: string;
  canSignUp: boolean;
  onCoupon?: (code: string) => Promise<unknown>;
}
export default function CustomerAccount({ initialEmail = '', canSignUp, onCoupon }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);
  const [coupon, setCoupon] = useState<WelcomeCoupon | null>(null);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>(canSignUp ? 'signup' : 'signin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    const refresh = () => {
      void fetchCustomerAccount().then(value => { if (current) setAccount(value); },
        error => { if (current) setError(error instanceof Error ? error.message : 'Unable to restore account.'); });
    };
    refresh();
    void fetchWelcomeOffer().then(value => { if (current) setOffer(value); },
      error => { if (current) setError(error instanceof Error ? error.message : 'Unable to load offer.'); });
    void loadSupabase().then(client => {
      if (!current || !client) return;
      const { data } = client.auth.onAuthStateChange(() => { window.setTimeout(() => { if (current) refresh(); }, 0); });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => { current = false; unsubscribe?.(); };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to complete account request.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-cocoa/20 bg-white p-3 text-sm text-cocoa" aria-label="Customer account">
      <h3 className="font-semibold">{account ? 'Your account' : 'Optional email account'}</h3>
      {account ? <>
        <p className="mt-1 break-words">Verified email: {account}</p>
        <button type="button" disabled={busy} className="mt-2 underline" onClick={() => { void run(async () => {
          await signOutCustomer(); setAccount(null); setCoupon(null); setSent(false);
          setMessage('Signed out. Your account cart remains saved.');
        }); }}>Sign out</button>
      </> : <>
        <p className="mt-1 text-xs text-cocoa/70">Guest ordering is always available. Verify an email to keep this cart linked to your account.</p>
        <div className="mt-2 flex gap-3">
          {canSignUp && <button type="button" disabled={busy} className="underline"
            onClick={() => { setMode('signup'); setSent(false); setError(''); }}>Create account</button>}
          <button type="button" disabled={busy} className="underline"
            onClick={() => { setMode('signin'); setSent(false); setError(''); }}>Sign in</button>
        </div>
        <form className="mt-2 space-y-2" onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            if (mode === 'signup') { await registerCustomerEmail(email); setSent(true); }
            else await sendCustomerSignIn(email);
            setMessage('Check your email for a verification link. Your email provider may put it in spam.');
          });
        }}>
          <label className="block">Account email
            <input type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy || sent}
              onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>
          <button disabled={busy || sent} className="rounded-full border border-cocoa px-3 py-2">
            {busy ? 'Please wait…' : mode === 'signup' ? 'Send signup email' : 'Send sign-in link'}
          </button>
        </form>
        {sent && <>
          <p className="mt-2 text-xs">Open the link in this browser, or enter the verification code if your email includes one.</p>
          <form className="mt-2 space-y-2" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              await confirmCustomerEmail(email, token);
              setAccount(await fetchCustomerAccount());
              setMessage('Your email is verified. Your cart has been preserved.');
            });
          }}>
            <label className="block">Email verification code
              <input required inputMode="numeric" autoComplete="one-time-code" value={token} disabled={busy}
                onChange={event => setToken(event.target.value)} className="mt-1 w-full rounded border p-2" />
            </label>
            <button disabled={busy} className="rounded-full border border-cocoa px-3 py-2">Verify email</button>
          </form>
          <button type="button" disabled={busy} onClick={() => { setSent(false); setToken(''); }} className="mt-2 underline">
            Change email / resend
          </button>
        </>}
      </>}
      {offer?.enabled && <>
        <p className="mt-3 text-xs">
          First-order code ILOVELUVIA: {offer.percent}% off items, up to ₹{offer.maxDiscountRupees},
          minimum items subtotal ₹{offer.minimumSubtotalRupees}. Valid {offer.validDays} days.
          One use per verified email address; shipping excluded. Final eligibility confirmed with your order.
        </p>
        {account && <button type="button" disabled={busy} className="mt-2 rounded-full bg-cocoa px-3 py-2 text-white"
          onClick={() => { void run(async () => {
            const next = await emailWelcomeCoupon(); setCoupon(next);
            setMessage('Your welcome coupon email was accepted for delivery. Check your inbox or spam.');
          }); }}>Email my welcome coupon</button>}
      </>}
      {coupon && <div className="mt-2">
        <p className="break-words font-semibold">{coupon.code}</p>
        <p className="text-xs">Expires {new Date(coupon.expires_at).toLocaleDateString()}.</p>
        {onCoupon && <button type="button" disabled={busy} className="mt-1 underline"
          onClick={() => { void run(async () => { await onCoupon(coupon.code); setMessage('Coupon added to your order request. Luvia will confirm the discount.'); }); }}>
          Use coupon on this order request
        </button>}
      </div>}
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}
