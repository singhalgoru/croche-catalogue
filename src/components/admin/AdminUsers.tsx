import { useEffect, useState } from 'react';
import { changeAdminUser, fetchAdminUsers } from '../../services/adminUsers';
import type { AdminDirectory, AdminUser, AdminUserChange } from '../../services/adminUsers';

export default function AdminUsers() {
  const [expanded, setExpanded] = useState(false);
  const [directory, setDirectory] = useState<AdminDirectory | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'add' | 'edit' | 'password' | 'remove' | null>(null);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  useEffect(() => {
    if (!expanded) return;
    let current = true;
    void fetchAdminUsers().then(value => { if (current) setDirectory(value); })
      .catch(failure => { if (current) { setDirectory(null); setError(failure instanceof Error ? failure.message : 'Unable to load admins.'); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [expanded, refresh]);
  const clear = () => { setMode(null); setTarget(null); setPassword(''); setConfirmation(''); setCurrentPassword(''); };
  const open = (next: NonNullable<typeof mode>, user: AdminUser | null = null) => {
    clear(); setMode(next); setTarget(user); setName(user?.name ?? ''); setEmail('');
    setError(''); setMessage('');
  };
  return <section aria-label="Admin users" className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 text-cocoa shadow-sm">
    <button type="button" aria-expanded={expanded} aria-controls="admin-user-content"
      disabled={busy} className="flex w-full items-center justify-between text-left font-heading text-xl font-bold"
      onClick={() => { if (!expanded) setLoading(true); else clear(); setExpanded(value => !value); setError(''); }}>
      <span>Admin users</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div id="admin-user-content" hidden={!expanded}>
      <p className="mt-3 text-sm text-cocoa/70">Only the owner can add, edit or remove admin access. Each admin can change their own password. Your current password and bot verification authorize every change.</p>
      <button type="button" disabled={busy || loading} className="mt-3 min-h-11 text-sm underline disabled:opacity-50"
        onClick={() => { clear(); setLoading(true); setError(''); setRefresh(value => value + 1); }}>Refresh admin users</button>
      {loading && <p role="status">Loading admin users...</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      {directory && !loading && <>
        {directory.isOwner && <button type="button" disabled={busy} className="ml-4 min-h-11 text-sm font-semibold underline"
          onClick={() => open('add')}>Add admin user</button>}
        <ul className="mt-3 divide-y divide-mustard/30">
          {directory.users.map(user => <li key={user.id} className="py-3 text-sm">
            <p className="font-semibold">{user.name || 'Admin'}{user.isOwner ? ' · Owner' : ''}</p>
            <p className="break-all">{user.email}</p>
            <p className="text-xs text-cocoa/65">{user.verified ? 'Email verified' : 'Invitation pending activation'}{user.id === directory.currentUserId ? ' · You' : ''}</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {directory.isOwner && <button type="button" disabled={busy} className="min-h-11 underline" onClick={() => open('edit', user)}>Edit {user.email}</button>}
              {(directory.isOwner || user.id === directory.currentUserId) && <button type="button" disabled={busy} className="min-h-11 underline"
                onClick={() => open('password', user)}>Change password for {user.email}</button>}
              {directory.isOwner && !user.isOwner && <button type="button" disabled={busy} className="min-h-11 text-red-700 underline"
                onClick={() => open('remove', user)}>Remove access for {user.email}</button>}
            </div>
          </li>)}
        </ul>
      </>}
      {mode && <form aria-label="Manage admin account" className="mt-4 grid gap-3 rounded-xl bg-cream p-4"
        onSubmit={event => {
          event.preventDefault(); setError(''); setMessage('');
          if (mode === 'password' && password !== confirmation) { setError('New passwords do not match.'); return; }
          let change: AdminUserChange;
          if (mode === 'add') change = { action: 'add', name, email };
          else {
            if (!target) { setError('Select an admin account first.'); return; }
            change = mode === 'edit' ? { action: 'edit', id: target.id, name }
              : mode === 'password' ? { action: 'password', id: target.id, password }
                : { action: 'remove', id: target.id };
          }
          setBusy(true);
          void changeAdminUser(change, currentPassword).then(result => {
            clear(); setMessage(result); setLoading(true); setRefresh(value => value + 1);
          }).catch(failure => { setCurrentPassword(''); setPassword(''); setConfirmation(''); setError(failure instanceof Error ? failure.message : 'Unable to update admin.'); })
            .finally(() => setBusy(false));
        }}>
        <h3 className="font-semibold">{mode === 'add' ? 'Add admin user' : `${mode === 'edit' ? 'Edit name' : mode === 'password' ? 'Change password' : 'Remove admin access'}: ${target?.email}`}</h3>
        {mode === 'add' && <>
          <p className="text-xs">New accounts receive a Supabase invitation to set their password. Existing accounts must already have a verified email; their login details are not changed.</p>
          <label>Admin email<input type="email" autoComplete="off" required maxLength={254} value={email} disabled={busy}
            onChange={event => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2" /></label>
        </>}
        {(mode === 'add' || mode === 'edit') && <label>Admin name<input required maxLength={80} value={name} disabled={busy}
          onChange={event => setName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2" /></label>}
        {mode === 'edit' && <p className="text-xs">Login email remains unchanged. To use another email, add its verified account, then remove old admin access.</p>}
        {mode === 'password' && <>
          <p className="text-xs">Use 12–128 characters with uppercase, lowercase and a number. Passwords are never displayed or stored in this form after saving.</p>
          <label>New admin password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy}
            onChange={event => setPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2" /></label>
          <label>Confirm new admin password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} disabled={busy}
            onChange={event => setConfirmation(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2" /></label>
        </>}
        {mode === 'remove' && <p className="text-sm">Confirm removing admin access. This does not delete the account, orders, products or sales. The owner cannot be removed.</p>}
        <p id="admin-password-authorization-help" className="text-xs">Enter the password you currently use to sign in. This field only authorizes the change; it is not the new password.{target && target.id !== directory?.currentUserId ? " Use your own password, not this admin's password." : ''}</p>
        <label>Your current password<input type="password" autoComplete="current-password" aria-describedby="admin-password-authorization-help" required value={currentPassword} disabled={busy}
          onChange={event => setCurrentPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/25 p-2" /></label>
        <div className="flex flex-wrap gap-4">
          <button type="submit" disabled={busy || loading} className="min-h-11 rounded-full bg-cocoa px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving...' : mode === 'remove' ? 'Confirm remove access' : 'Save admin account'}</button>
          <button type="button" disabled={busy} onClick={clear} className="min-h-11 underline">Cancel admin changes</button>
        </div>
      </form>}
    </div>
  </section>;
}
