import { useState } from 'react';
import { changeCustomerPassword } from '../services/customer';

export default function ChangePassword() {
  const [expanded, setExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState({ current: false, new: false, confirmation: false });
  const clear = () => {
    setCurrentPassword(''); setPassword(''); setConfirmation('');
    setVisible({ current: false, new: false, confirmation: false });
  };
  return <section aria-label="Account password" className="mt-4 border-t border-cocoa/15 pt-3">
    <button type="button" disabled={busy} aria-expanded={expanded} aria-controls="account-password-form"
      className="min-h-11 font-semibold underline" onClick={() => {
        clear(); setError(''); setMessage(''); setExpanded(value => !value);
      }}>Change password</button>
    {message && <p role="status" className="mt-2">{message}</p>}
    {expanded && <form id="account-password-form" aria-label="Change account password" className="mt-2 space-y-3"
      onSubmit={event => {
        event.preventDefault(); setBusy(true); setError(''); setMessage('');
        void changeCustomerPassword(currentPassword, password, confirmation).then(() => {
          clear(); setExpanded(false);
          setMessage('Your password has been changed. Use the new password next time you sign in. A security notification has been queued for your account email from hello@luviacreations.com.');
        }).catch(failure => {
          clear(); setError(failure instanceof Error ? failure.message : 'Unable to change your password.');
        }).finally(() => setBusy(false));
      }}>
      <p className="text-xs text-cocoa/70">Enter your current login password to authorize the change. Choose a new password of 8–72 characters with a letter and a number. Your saved addresses and cart are preserved.</p>
      <label className="block">Current password<input type={visible.current ? 'text' : 'password'} required autoComplete="current-password"
        value={currentPassword} disabled={busy} onChange={event => setCurrentPassword(event.target.value)}
        className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={visible.current} disabled={busy}
        onChange={event => setVisible(value => ({ ...value, current: event.target.checked }))} />Show current password</label>
      <label className="block">New password<input type={visible.new ? 'text' : 'password'} required minLength={8} maxLength={72} autoComplete="new-password"
        value={password} disabled={busy} onChange={event => setPassword(event.target.value)}
        className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={visible.new} disabled={busy}
        onChange={event => setVisible(value => ({ ...value, new: event.target.checked }))} />Show new password</label>
      <label className="block">Confirm new password<input type={visible.confirmation ? 'text' : 'password'} required minLength={8} maxLength={72} autoComplete="new-password"
        value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)}
        className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={visible.confirmation} disabled={busy}
        onChange={event => setVisible(value => ({ ...value, confirmation: event.target.checked }))} />Show password confirmation</label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="min-h-11 rounded-full bg-cocoa px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save new password'}</button>
        <button type="button" disabled={busy} className="min-h-11 underline" onClick={() => {
          clear(); setError(''); setExpanded(false);
        }}>Cancel password change</button>
      </div>
    </form>}
  </section>;
}
