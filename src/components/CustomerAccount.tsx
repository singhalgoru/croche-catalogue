import { useEffect, useRef, useState } from 'react';
import { loadSupabase } from '../lib/supabaseConfig';
import { fetchCustomerAccount, registerCustomerEmail, confirmCustomerEmail, sendCustomerPasswordReset,
  fetchWelcomeOffer, fetchCustomerProfile, signInCustomerWithPassword,
  validateCustomerPassword } from '../services/customer';
import type { DeliveryDetails, WelcomeOffer } from '../types/customer';
import { emptyDeliveryDetails } from '../utils/customer';
import AddressBook from './AddressBook';
import ChangePassword from './ChangePassword';

interface Props {
  initialEmail?: string;
  initialDetails?: DeliveryDetails;
  canSignUp: boolean;
  initialMode?: 'signup' | 'signin';
  onGuest?: () => void;
  onContinue?: (profile: DeliveryDetails | null) => void;
  onModeChange?: (mode: 'signup' | 'signin') => void;
  signedIn?: boolean;
}
export default function CustomerAccount({ initialEmail = '', initialDetails, canSignUp, initialMode, onGuest, onContinue, onModeChange, signedIn = false }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [details, setDetails] = useState(() => initialDetails ?? emptyDeliveryDetails());
  const [profile, setProfile] = useState<DeliveryDetails | null>(null);
  const [token, setToken] = useState('');
  const [account, setAccount] = useState<string | null>();
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>(canSignUp ? initialMode ?? 'signup' : 'signin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current = true;
    let unsubscribe: (() => void) | undefined;
    const refresh = () => {
      void fetchCustomerAccount().then(async value => {
        if (!current) return;
        setAccount(value);
        const saved = value ? await fetchCustomerProfile() : null;
        if (current) setProfile(saved);
      }).catch(
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
  if (signedIn && account === undefined) return (
    <section className="rounded-xl border border-cocoa/20 bg-white p-3 text-sm text-cocoa" aria-label="Customer account">
      {error ? <p role="alert">{error}</p> : <p role="status">Loading your account…</p>}
    </section>
  );
  return (
    <section className="rounded-xl border border-cocoa/20 bg-white p-3 text-sm text-cocoa" aria-label="Customer account">
      <h3 className="font-semibold">{account ? 'Your addresses' : 'Optional email account'}</h3>
      {account ? <>
        <p className="mt-2 break-all text-sm"><span className="font-semibold">Signed-in email: </span>{account}</p>
        <AddressBook accountEmail={account} onDefaultChange={setProfile} />
        <a href={`${import.meta.env.BASE_URL}?account=orders`}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-cocoa px-5 py-2 font-semibold text-white">
          My orders
        </a>
        <ChangePassword />
        <a href={`${import.meta.env.BASE_URL}?page=feedback`} className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          Share feedback
        </a>
        {onContinue && <button type="button" disabled={busy} className="mt-3 block w-full rounded-full bg-cocoa px-4 py-3 font-semibold text-white"
          onClick={() => onContinue(profile)}>Continue to delivery details</button>}
      </> : <>
        <p className="mt-1 text-xs text-cocoa/70">Creating an account is optional. Sign in for saved addresses and order history, or verify your email to activate a new account.</p>
        {offer?.enabled && canSignUp && <p className="mt-3 rounded-xl border border-mustard/40 bg-mustard/10 p-3 font-semibold">
          Sign up and get {offer.percent}% off your first order. Minimum spend, discount cap and expiry apply; review the welcome offer at checkout.
        </p>}
        {canSignUp ? <div className="mt-2 flex gap-3" aria-label="Account options">
          <button type="button" disabled={busy} aria-pressed={mode === 'signup'}
            className={`min-h-11 px-2 underline ${mode === 'signup' ? 'font-bold' : ''}`}
            onClick={() => { setMode('signup'); setForgotPassword(false); onModeChange?.('signup'); setSent(false); setError(''); setMessage(''); emailInput.current?.focus(); }}>Create account</button>
          <button type="button" disabled={busy} aria-pressed={mode === 'signin'}
            className={`min-h-11 px-2 underline ${mode === 'signin' ? 'font-bold' : ''}`}
            onClick={() => { setMode('signin'); setForgotPassword(false); onModeChange?.('signin'); setSent(false); setError(''); setMessage(''); emailInput.current?.focus(); }}>Sign in</button>
        </div> : <h4 className="mt-3 font-semibold">Sign in to your saved cart</h4>}
        <p className="mt-1 text-xs text-cocoa/70">
          {forgotPassword ? 'Enter only your account email. We will email a link to choose a new password; your current password is not needed.'
            : mode === 'signin' ? 'Sign in with your email and password. Forgot it? We can email you a reset link.'
            : 'Tell us a little about yourself and choose a password. We will email an activation link; your profile is saved and your password works only after you verify your email.'}
        </p>
        <form className="mt-2 space-y-2" aria-label={forgotPassword ? 'Forgot password' : mode === 'signup' ? 'Customer signup' : 'Customer sign in'} onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            if (forgotPassword) {
              await sendCustomerPasswordReset(email);
              setMessage('If an account exists for that email, a password reset link is on its way. Check your inbox or spam and open it in this browser.');
            } else if (mode === 'signup') {
              const validation = validateCustomerPassword(password, confirmPassword);
              if (validation) throw new Error(validation);
              await registerCustomerEmail({ ...details, email }, password);
              setSent(true); setPassword(''); setConfirmPassword('');
              setMessage('Signup verification requested. Check your inbox or spam for the activation link.');
            } else {
              await signInCustomerWithPassword(email, password);
              setPassword('');
              setMessage('Signed in. Your saved cart and details are restored.');
            }
          });
        }}>
          {mode === 'signup' && <>
            <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['name', 'Full name', 'name', 80],
              ['phone', 'Mobile number', 'tel-national', 10],
              ['addressLine1', 'House / building and street', 'address-line1', 200],
              ['addressLine2', 'Area / landmark (optional)', 'address-line2', 200],
              ['city', 'City', 'address-level2', 80],
              ['state', 'State', 'address-level1', 80],
              ['pincode', 'Pincode', 'postal-code', 6],
            ] as const).map(([key, label, autoComplete, maxLength]) => (
              <label key={key} className={`block ${key.startsWith('address') ? 'sm:col-span-2' : ''}`}>{label}
                <input required={key !== 'addressLine2'} maxLength={maxLength} autoComplete={autoComplete}
                  inputMode={key === 'phone' || key === 'pincode' ? 'numeric' : undefined}
                  value={details[key]} disabled={busy || sent}
                  onChange={event => setDetails(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded border p-2" />
              </label>
            ))}
            </div>
            <p className="text-xs text-cocoa/60">India only. Your address and mobile are private customer details, not verified identity or marketing consent.</p>
          </>}
          <label className="block">Account email
            <input ref={emailInput} type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy || sent}
              onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>
          {!forgotPassword && <label className="block">Password
            <input type="password" required minLength={mode === 'signup' ? 8 : undefined} maxLength={72}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} disabled={busy || sent}
              onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded border p-2" />
          </label>}
          {mode === 'signup' && <>
            <label className="block">Confirm password
              <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmPassword} disabled={busy || sent}
                onChange={event => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded border p-2" />
            </label>
            <p className="text-xs text-cocoa/60">At least 8 characters with a letter and a number.</p>
          </>}
          <button disabled={busy || sent} className="rounded-full border border-cocoa px-3 py-2">
            {busy ? 'Please wait…' : forgotPassword ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        {mode === 'signin' && <button type="button" disabled={busy} className="mt-2 underline" onClick={() => {
          setForgotPassword(value => !value); setPassword(''); setConfirmPassword(''); setError(''); setMessage('');
          emailInput.current?.focus();
        }}>{forgotPassword ? 'Back to sign in' : 'Forgot password?'}</button>}
        {onGuest && <div className="mt-3 rounded-xl border border-cocoa/15 bg-cream/60 p-3">
          <p className="font-semibold">Prefer not to create an account?</p>
          <p className="mt-1 text-xs">Continue as a guest and add your delivery address when you send your order request.
            {offer?.enabled ? ` Guest orders do not receive the one-time welcome reward (${offer.percent}% off your first order, code ILOVELUVIA), which needs an activated account.`
              : ' Guest orders do not receive account-only welcome rewards.'}</p>
          <button type="button" disabled={busy} className="mt-2 rounded-full border border-cocoa px-3 py-2" onClick={onGuest}>
            Continue as guest
          </button>
        </div>}
        {sent && <>
          <p className="mt-2 text-xs">Open the link in this browser, or enter the verification code if your email includes one.</p>
          <form className="mt-2 space-y-2" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              await confirmCustomerEmail(email, token);
              const verifiedEmail = await fetchCustomerAccount();
              if (!verifiedEmail) throw new Error('Email verification is not complete. Open the email link or retry your verification code.');
              setAccount(verifiedEmail);
              const saved = await fetchCustomerProfile();
              if (!saved) throw new Error('Your email is verified, but signup details are unavailable or expired. Contact Luvia to complete your profile.');
              setProfile(saved);
              setMessage('Welcome to Luvia! Your account is activated and your customer details are saved. Your cart has been preserved.');
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
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}
