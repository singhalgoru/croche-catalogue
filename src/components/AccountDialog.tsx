import { useEffect, useRef, useState } from 'react';
import CustomerAccount from './CustomerAccount';
import { setCustomerPassword } from '../services/customer';

interface Props {
  mode: 'signin' | 'signup' | 'reset';
  accountName?: string | null;
  onClose: () => void;
}
export default function AccountDialog({ mode, accountName, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-cocoa/40 sm:items-center" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-cream p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="account-dialog-title" className="font-heading text-xl font-bold text-cocoa">
            {mode === 'reset' ? 'Set a new password' : accountName ? `Hi, ${accountName}` : mode === 'signup' ? 'Create your Luvia account' : 'Sign in to Luvia'}
          </h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close account"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cocoa/20 text-2xl text-cocoa">×</button>
        </div>
        {mode === 'reset' ? <PasswordResetForm onDone={onClose} /> : <CustomerAccount key={mode} canSignUp initialMode={mode} />}
      </div>
    </div>
  );
}

function PasswordResetForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  if (saved) return (
    <section className="space-y-3 rounded-xl border border-cocoa/20 bg-white p-3 text-sm text-cocoa">
      <p role="status">Your password has been updated and you're signed in. Next time, sign in with your email and this new password.</p>
      <button type="button" onClick={onDone} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-white">Continue shopping</button>
    </section>
  );
  return (
    <form aria-label="Reset password" className="space-y-2 rounded-xl border border-cocoa/20 bg-white p-3 text-sm text-cocoa" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void setCustomerPassword(password, confirmation).then(() => setSaved(true)).catch(failure => {
        const text = failure instanceof Error ? failure.message : '';
        setError(/session|jwt|expired/i.test(text)
          ? 'This reset link has expired or was already used. Choose Sign in, then Forgot password, to get a new one.'
          : text || 'Unable to save your new password.');
      }).finally(() => setBusy(false));
    }}>
      <p className="text-xs text-cocoa/70">Choose a new password for your Luvia account. Use at least 8 characters with a letter and a number.</p>
      <label className="block">New password
        <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} disabled={busy}
          onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="block">Confirm new password
        <input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmation} disabled={busy}
          onChange={event => setConfirmation(event.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-full bg-cocoa px-4 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}