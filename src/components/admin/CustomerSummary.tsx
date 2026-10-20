import { useEffect, useState } from 'react';
import { fetchAdminCustomerSummary } from '../../services/customer';
import type { AdminCustomerSummary } from '../../types/customer';
import { changeAdminUser } from '../../services/adminUsers';

const welcomeLabels: Record<AdminCustomerSummary['customers'][number]['welcomeStatus'], string> = {
  sent: 'Sent', pending: 'Queued', retrying: 'Retrying', not_queued: 'Not queued',
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CustomerSummary() {
  const [summary, setSummary] = useState<AdminCustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState({ offset: 0, refresh: 0 });
  const [selected, setSelected] = useState<AdminCustomerSummary['customers'][number] | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const clearAction = () => { setSelected(null); setReason(''); setPassword(''); setShowPassword(false); setActionError(''); };
  useEffect(() => {
    let current = true;
    void fetchAdminCustomerSummary(page.offset).then(value => { if (current) setSummary(value); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load registered customers.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page]);
  return <section aria-label="Registered customers" className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-heading text-xl font-bold text-cocoa">Registered customers</h2>
      <button type="button" disabled={loading} className="min-h-11 text-sm font-semibold underline disabled:opacity-50"
        onClick={() => { setLoading(true); setError(''); setPage(previous => ({ ...previous, refresh: previous.refresh + 1 })); }}>Refresh customers</button>
    </div>
    <p className="mt-1 text-sm text-cocoa/70">Luvia customer accounts and active signups awaiting email activation. Guest visitors are not counted.</p>
    <p className="mt-2 text-xs text-cocoa/70">Temporarily disable an account when login fraud is reported. It stays disabled until an admin re-enables it; orders and account details are not deleted. Admin accounts are protected.</p>
    {message && <p role="status" className="mt-3 text-sm text-cocoa">{message}</p>}
    {selected && <form aria-label="Customer account access" className="my-4 space-y-3 rounded-xl border border-mustard/50 bg-cream p-4 text-sm text-cocoa"
      onSubmit={event => {
        event.preventDefault(); setSaving(true); setActionError(''); setMessage('');
        void changeAdminUser({ action: selected.suspended ? 'restore-customer' : 'suspend-customer', id: selected.id, reason }, password)
          .then(value => { setMessage(value); clearAction(); setLoading(true); setError(''); setPage(previous => ({ ...previous, refresh: previous.refresh + 1 })); })
          .catch(failure => setActionError(failure instanceof Error ? failure.message : 'Unable to change customer account access.'))
          .finally(() => { setPassword(''); setShowPassword(false); setSaving(false); });
      }}>
      <h3 className="font-semibold break-all">{selected.suspended ? 'Re-enable' : 'Temporarily disable'} {selected.email}</h3>
      <p>{selected.suspended ? 'Restore access after verifying the customer identity. They can then use Forgot password with their email.'
        : 'This prevents new sign-ins and blocks existing sessions from accessing account data. Password reset links cannot restore access while disabled.'}</p>
      <label className="block">Reason (internal)
        <input required minLength={5} maxLength={300} value={reason} disabled={saving} onChange={event => setReason(event.target.value)}
          className="mt-1 w-full rounded border p-2" />
      </label>
      <p className="text-xs">Keep the reason brief. Do not enter passwords, payment details or sensitive personal information.</p>
      <label className="block">Your current admin password
        <input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} disabled={saving}
          onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showPassword} disabled={saving}
        onChange={event => setShowPassword(event.target.checked)} />Show admin password</label>
      {actionError && <p role="alert" className="text-red-700">{actionError}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={saving} className="min-h-11 rounded-full bg-cocoa px-4 py-2 font-semibold text-white">
          {saving ? 'Saving...' : selected.suspended ? 'Confirm re-enable account' : 'Confirm disable account'}
        </button>
        <button type="button" disabled={saving} onClick={clearAction} className="min-h-11 underline">Cancel account change</button>
      </div>
    </form>}
    {loading && <p role="status" className="mt-3">Loading registered customers...</p>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {summary && !error && <>
      <dl className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Total customers', summary.total], ['Verified accounts', summary.verified],
          ['Pending activation', summary.pendingActivation], ['Welcome emails sent', summary.welcomeEmailsSent]].map(([label, count]) =>
          <div key={label} className="rounded-xl bg-cream p-3 text-cocoa"><dt className="text-xs">{label}</dt><dd className="text-2xl font-bold">{count}</dd></div>)}
      </dl>
      {!loading && summary.total === 0 && <p>No registered customers yet.</p>}
      <div className="space-y-3">
        {summary.customers.map(customer => <article key={customer.id} aria-label={`Customer ${customer.email}`}
          className="grid gap-3 rounded-xl border border-cocoa/20 p-3 text-sm text-cocoa sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">{customer.name}</h3>
            <p className="break-all">{customer.email}</p>
            <p>{customer.phone}{customer.city ? ` · ${customer.city}` : ''}{customer.pincode ? ` ${customer.pincode}` : ''}</p>
          </div>
          <div className="text-xs">
            <p className="font-semibold">{customer.verified ? 'Verified' : 'Awaiting activation'}</p>
            <p className={customer.suspended ? 'font-semibold text-red-700' : ''}>Account access: {customer.suspended ? 'Temporarily disabled' : 'Active'}</p>
            <p>{customer.verified ? 'Registered' : 'Signup submitted'}: {dateLabel(customer.registeredAt)}</p>
            <p>Last sign-in: {customer.lastSignInAt ? dateLabel(customer.lastSignInAt) : 'Not yet'}</p>
            <p>Welcome email: {!customer.verified && customer.welcomeStatus === 'not_queued'
              ? 'Waiting for email verification' : welcomeLabels[customer.welcomeStatus]}</p>
            {customer.canManageAccount && <button type="button" disabled={saving || loading}
              className="mt-2 min-h-11 text-sm font-semibold underline disabled:opacity-50"
              onClick={() => { clearAction(); setMessage(''); setSelected(customer); }}>
              {customer.suspended ? 'Re-enable account' : 'Temporarily disable account'}
            </button>}
          </div>
        </article>)}
      </div>
      {summary.total > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>Showing {page.offset + 1}–{Math.min(page.offset + summary.customers.length, summary.total)} of {summary.total}</p>
        <div className="flex gap-4">
          <button type="button" disabled={loading || page.offset === 0} className="min-h-11 underline disabled:opacity-50"
            onClick={() => { setLoading(true); setError(''); setPage(previous => ({ ...previous, offset: Math.max(0, previous.offset - 50) })); }}>Previous customers</button>
          <button type="button" disabled={loading || page.offset + 50 >= summary.total} className="min-h-11 underline disabled:opacity-50"
            onClick={() => { setLoading(true); setError(''); setPage(previous => ({ ...previous, offset: previous.offset + 50 })); }}>Next customers</button>
        </div>
      </div>}
    </>}
  </section>;
}
