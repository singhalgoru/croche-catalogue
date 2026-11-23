import { useEffect, useState, type FormEvent } from 'react';
import AdminDialog from './AdminDialog';
import { fetchReferenceVideo, saveReferenceVideo } from '../../services/productReferenceVideo';

const buttonClass = 'min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50';

export default function ProductReferenceVideo({ product, disabled = false }: {
  product: { id: string; name: string }; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={buttonClass} disabled={disabled} onClick={() => setOpen(true)}>
      Reference video
    </button>
    {open && <ReferenceVideoDialog product={product} onClose={() => setOpen(false)} />}
  </>;
}

function ReferenceVideoDialog({ product, onClose }: {
  product: { id: string; name: string }; onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchReferenceVideo(product.id).then(url => {
      if (active) { setSaved(url); setInput(url ?? ''); setLoaded(true); setLoading(false); }
    }, reason => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Unable to load the reference video.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [product.id]);

  const refresh = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const url = await fetchReferenceVideo(product.id);
      setSaved(url); setInput(url ?? ''); setLoaded(true); setConfirmRemoval(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the reference video.');
    } finally { setBusy(false); }
  };
  const save = async (value: string | null) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const url = await saveReferenceVideo(product.id, saved, value);
      setSaved(url); setInput(url ?? ''); setConfirmRemoval(false);
      setNotice(url ? 'Reference video link saved.' : 'Reference video link removed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the reference video.');
    } finally { setBusy(false); }
  };

  return <AdminDialog title={`Reference video - ${product.name}`} busy={busy || loading} onClose={onClose}>
    <div className="space-y-4 p-4">
      <p className="text-sm">This link is private to catalogue admins and is not shown to customers. The video remains on its original website; its sharing permissions still apply.</p>
      {loading && <p role="status">Loading reference video…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!loading && <button type="button" disabled={busy} className={buttonClass} onClick={() => void refresh()}>
        Refresh saved link
      </button>}
      {loaded && <form className="space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(input); }}>
        <label className="block text-sm font-semibold">Video link
          <input type="url" required maxLength={2048} value={input} disabled={busy}
            onChange={event => { setInput(event.target.value); setNotice(''); }}
            placeholder="https://..." className="mt-1 block min-h-11 w-full rounded-lg border border-cocoa/30 bg-white p-2 font-normal" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save link'}</button>
          {saved && <a href={saved} target="_blank" rel="noopener noreferrer" className={`${buttonClass} inline-flex items-center`}>
            Open saved video
          </a>}
          {saved && !confirmRemoval && <button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirmRemoval(true)}>
            Remove link
          </button>}
        </div>
        {confirmRemoval && <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm">Remove this reference link? The video on its original website will not be deleted.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={buttonClass} onClick={() => void save(null)}>Confirm removal</button>
            <button type="button" disabled={busy} className={buttonClass} onClick={() => setConfirmRemoval(false)}>Keep link</button>
          </div>
        </div>}
      </form>}
    </div>
  </AdminDialog>;
}
