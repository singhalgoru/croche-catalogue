import { useCallback, useEffect, useState } from 'react';
import content from '../../content/artisanOnboarding.json';
import { artisanStatuses, deleteArtisanApplication, fetchArtisanApplications, fetchArtisanHistory, updateArtisanApplication } from '../../services/artisans';
import type { ArtisanApplication, ArtisanHistory, ArtisanStatus } from '../../services/artisans';
import ArtisanInvitations from './ArtisanInvitations';

function ArtisanReview({ application, onClose, onChanged }: {
  application: ArtisanApplication; onClose: () => void; onChanged: () => void;
}) {
  const [status, setStatus] = useState<ArtisanStatus>(application.status);
  const [notes, setNotes] = useState(application.admin_notes);
  const [history, setHistory] = useState<ArtisanHistory[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const focusHeading = useCallback((element: HTMLHeadingElement | null) => element?.focus(), []);
  useEffect(() => {
    let current = true;
    void fetchArtisanHistory(application.id).then(rows => {
      if (current) setHistory(rows);
    }).catch(failure => {
      if (current) setHistoryError(failure instanceof Error ? failure.message : 'Unable to load history.');
    }).finally(() => { if (current) setHistoryLoading(false); });
    return () => { current = false; };
  }, [application.id, historyKey]);
  return <section aria-labelledby="artisan-review-heading" className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <button disabled={busy} onClick={onClose} className="min-h-11 underline">Back to applications</button>
    <h2 id="artisan-review-heading" className="font-heading text-2xl font-bold" tabIndex={-1}
      ref={focusHeading}>{application.details.fullName}</h2>
    <p className="break-all text-xs">Reference: {application.id}</p>
    <p className="text-sm">Applied {new Date(application.created_at).toLocaleString('en-IN')} · Privacy notice {application.consent_version}</p>
    <dl className="grid gap-3 sm:grid-cols-2">
      {content.fields.map(field => <div key={field.name} className="min-w-0">
        <dt className="text-sm font-semibold">{field.label}</dt>
        <dd className="whitespace-pre-wrap break-words">{String(Reflect.get(application.details, field.name)) || 'Not provided'}</dd>
      </div>)}
      <div><dt className="text-sm font-semibold">Paid trial interest</dt><dd>{application.details.paidTrial ? 'Yes' : 'Not selected'}</dd></div>
      <div><dt className="text-sm font-semibold">Confirmations</dt><dd>18 or older; application privacy consent recorded.</dd></div>
    </dl>
    <p className="text-xs">Portfolio links are unverified. Review only for selection; do not republish without separate permission.</p>
    <form aria-label="Review artisan" className="space-y-3" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError('');
      void updateArtisanApplication(application, status, notes).then(onChanged)
        .catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to save review.'))
        .finally(() => setBusy(false));
    }}>
      <label className="block text-sm font-semibold">Application status<select value={status} disabled={busy}
        onChange={event => { const next = artisanStatuses.find(value => value === event.target.value); if (next) setStatus(next); }}
        className="mt-1 block min-h-11 w-full rounded border p-2">
        {artisanStatuses.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <p className="text-xs">Approved is an internal review status, not a signed work agreement. Agree trial/batch terms separately before work starts.</p>
      <label className="block text-sm font-semibold">Internal review notes<textarea rows={4} maxLength={3000} value={notes} disabled={busy}
        onChange={event => setNotes(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      <p className="text-xs">Record work-related decisions only. Do not enter bank details, identity documents or sensitive personal information.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">{busy ? 'Saving...' : 'Save review'}</button>
    </form>
    <section aria-label="Application history" className="space-y-2">
      <h3 className="font-semibold">Review history</h3>
      {historyError ? <><p role="alert" className="text-red-700">{historyError}</p><button className="min-h-11 underline" onClick={() => { setHistoryError(''); setHistoryLoading(true); setHistoryKey(value => value + 1); }}>Retry history</button></>
        : historyLoading ? <p role="status">Loading history...</p>
          : <ul className="space-y-1 text-sm">{history.map(entry => <li key={entry.id}>
            {new Date(entry.created_at).toLocaleString('en-IN')} — {entry.action}: {entry.old_status ? `${entry.old_status} → ` : ''}{entry.new_status}
          </li>)}</ul>}
    </section>
    {!confirmDelete ? <button disabled={busy} className="min-h-11 text-red-700 underline" onClick={() => setConfirmDelete(true)}>Delete application</button>
      : <div className="space-y-2 rounded-xl border border-red-200 p-3 text-sm">
        <p>Permanently delete this application and its review history? The invitation cannot be used again. This cannot be undone.</p>
        <button disabled={busy} className="mr-4 min-h-11 text-red-700 underline" onClick={() => {
          setBusy(true); setError('');
          void deleteArtisanApplication(application).then(onChanged)
            .catch(failure => setError(failure instanceof Error ? failure.message : 'Unable to delete application.'))
            .finally(() => setBusy(false));
        }}>Confirm permanent deletion</button>
        <button disabled={busy} className="min-h-11 underline" onClick={() => setConfirmDelete(false)}>Cancel deletion</button>
      </div>}
  </section>;
}

export default function ArtisanManager() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', status: '' });
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<ArtisanApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ArtisanApplication | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    void fetchArtisanApplications(filter.search, filter.status, page).then(result => {
      if (current) { setRows(result.applications); setTotal(result.total); }
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to load applications.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [filter, page, refresh]);
  if (selected) return <ArtisanReview key={selected.id} application={selected} onClose={() => setSelected(null)} onChanged={() => {
    setSelected(null); setPage(0); setLoading(true); setError(''); setRefresh(value => value + 1); setMessage('Application changes saved.');
  }} />;
  return <div className="space-y-5 text-cocoa">
    <ArtisanInvitations />
    <section aria-labelledby="artisan-directory-title" className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 id="artisan-directory-title" className="font-heading text-2xl font-bold">Artisan applications</h2>
      <p className="text-sm">Private applications, not a public artisan directory. Review before arranging a paid trial. Unapproved applications expire after 180 days without an update.</p>
      {message && <p role="status">{message}</p>}
      <form role="search" aria-label="Search artisans" className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault(); setLoading(true); setError(''); setPage(0); setFilter(current => ({ ...current, search: search.trim() })); setRefresh(value => value + 1);
      }}>
        <label className="min-w-0 flex-1 text-sm">Name, mobile, skill or location<input maxLength={100} value={search}
          onChange={event => setSearch(event.target.value)} className="mt-1 block min-h-11 w-full rounded border p-2" /></label>
        <label className="text-sm">Filter status<select value={filter.status} onChange={event => {
          setLoading(true); setError(''); setPage(0); setFilter(current => ({ ...current, status: event.target.value }));
        }} className="mt-1 block min-h-11 w-full rounded border p-2"><option value="">All statuses</option>
          {artisanStatuses.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button disabled={loading} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">Search / refresh</button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {loading ? <p role="status">Loading applications...</p> : !error && <>
        <p className="text-sm">{total} application{total === 1 ? '' : 's'} found</p>
        <ul className="grid gap-3 md:grid-cols-2">{rows.map(application => <li key={application.id} className="min-w-0 rounded-xl border border-mustard/40 p-4">
          <h3 className="break-words font-semibold">{application.details.fullName}</h3>
          <p className="text-sm">{application.status} · {application.details.city}, {application.details.state}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm">{application.details.skills}</p>
          <button onClick={() => { setMessage(''); setSelected(application); }} className="mt-2 min-h-11 underline">Review {application.details.fullName}</button>
        </li>)}</ul>
        <div className="flex flex-wrap items-center gap-4">
          <button disabled={page === 0} onClick={() => { setLoading(true); setError(''); setPage(value => value - 1); }} className="min-h-11 underline disabled:opacity-40">Previous</button>
          <span className="text-sm">Page {page + 1}</span>
          <button disabled={(page + 1) * 25 >= total} onClick={() => { setLoading(true); setError(''); setPage(value => value + 1); }} className="min-h-11 underline disabled:opacity-40">Next</button>
        </div>
      </>}
    </section>
  </div>;
}
