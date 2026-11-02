import { useEffect, useState } from 'react';
import { customerLoveRepository, newTestimonial, prepareTestimonialPhoto, validateTestimonial,
  type AdminTestimonial, type CustomerLoveRepository } from '../../services/customerLove';
import { fetchPublishedProducts } from '../../services/products';
import type { Product } from '../../types/product';
import { TestimonialCard } from '../CustomerLove';
import AdminDialog from './AdminDialog';
import ImageFilePicker from './ImageFilePicker';
import { localDate } from '../../utils/date';

const fieldClass = 'mt-1 block min-h-11 w-full rounded-xl border border-cocoa/25 bg-white p-3 font-normal';
const buttonClass = 'min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50';

export default function CustomerLoveManager({ repository = customerLoveRepository, products: suppliedProducts }: {
  repository?: CustomerLoveRepository; products?: Product[];
}) {
  const [entries, setEntries] = useState<AdminTestimonial[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<AdminTestimonial | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<AdminTestimonial | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setLoadError('');
    Promise.all([repository.list(), suppliedProducts ? Promise.resolve(suppliedProducts) : fetchPublishedProducts()])
      .then(([nextEntries, nextProducts]) => { if (current) { setEntries(nextEntries); setProducts(nextProducts); } })
      .catch(failure => { if (current) setLoadError(failure instanceof Error ? failure.message : 'Unable to load testimonials.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [repository, suppliedProducts, retry]);
  const edit = async (entry: AdminTestimonial) => {
    setError(''); setBusy(true); setNotice('');
    try {
      const image = entry.has_image ? await repository.photo(entry.id) : null;
      if (entry.has_image && !image) throw new Error('The saved photo is unavailable. Reload before editing.');
      setDraft({ ...entry }); setPreview(image ?? undefined); setPhoto(null); setFile(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to open testimonial.'); }
    finally { setBusy(false); }
  };
  const update = (patch: Partial<AdminTestimonial>) => setDraft(value => {
    if (!value) return value;
    const changesPublicContent = ['display_name', 'quote', 'product_id', 'has_image', 'image_alt'].some(key => Object.hasOwn(patch, key));
    return { ...value, ...(changesPublicContent && value.consent_confirmed ? { consent_confirmed: false, published: false } : {}), ...patch };
  });
  return <section className="space-y-5 text-cocoa">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-mustard/40 bg-white p-5">
      <div className="max-w-2xl space-y-2">
        <h2 className="font-heading text-2xl font-bold">Customer Love</h2>
        <p className="text-sm">Turn customer messages into beautiful quote cards. Only published stories are public; featured stories also appear on the homepage.</p>
        <p className="text-xs">Keep the original meaning. Use initials or a customer-approved name. Obtain permission for the quote, name and photo; crop out chat details, faces and location clues as needed.</p>
      </div>
      <button type="button" className={buttonClass} disabled={busy || loading || Boolean(loadError)} onClick={() => void edit(newTestimonial())}>
        Add testimonial
      </button>
    </div>
    {loading && <p role="status">Loading testimonials...</p>}
    {loadError && <div><p role="alert">{loadError}</p><button className="min-h-11 underline"
      onClick={() => setRetry(value => value + 1)}>Retry testimonials</button></div>}
    {notice && <p role="status">{notice}</p>}
    {error && !draft && !deleteEntry && <p role="alert" className="text-red-700">{error}</p>}
    {!loading && !loadError && !entries.length && <p>No testimonials yet. Add your first customer story as a draft.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(entry => <article key={entry.id} className="space-y-3 rounded-2xl border border-mustard/40 bg-white p-5">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full px-3 py-1 ${entry.published ? 'bg-green-100 text-green-800' : 'bg-mustard/25'}`}>{entry.published ? 'Published' : 'Draft'}</span>
          {entry.featured && <span className="rounded-full bg-cream px-3 py-1">Homepage featured</span>}
        </div>
        <h3 className="font-semibold">{entry.display_name}</h3><p className="line-clamp-3 text-sm">{entry.quote}</p>
        <p className="text-xs">Order {entry.sort_order} · {entry.consent_confirmed ? 'Permission recorded' : 'Permission needed'}</p>
        <div className="flex gap-4"><button disabled={busy} onClick={() => void edit(entry)} className="min-h-11 underline">Edit {entry.display_name}</button>
          <button disabled={busy} onClick={() => { setError(''); setDeleteEntry(entry); }} className="min-h-11 text-red-700 underline">Delete</button></div>
      </article>)}
    </div>
    {draft && <AdminDialog title={draft.version ? 'Edit testimonial' : 'Add testimonial'} busy={busy} onClose={() => setDraft(null)}>
      <form aria-label="Testimonial editor" className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2" onSubmit={async event => {
        event.preventDefault(); setError(''); setBusy(true);
        try {
          validateTestimonial(draft);
          await repository.save(draft, photo);
          setDraft(null); setNotice(draft.published ? 'Testimonial published.' : 'Testimonial saved as a private draft.');
          setRetry(value => value + 1);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save testimonial.'); }
        finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <label className="block text-sm font-semibold">Customer display name
            <input className={fieldClass} required maxLength={80} placeholder="For example: A happy customer or approved initials"
              value={draft.display_name} onChange={event => update({ display_name: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Customer quote
            <textarea className={fieldClass} rows={4} required minLength={10} maxLength={1000} value={draft.quote}
              onChange={event => update({ quote: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Related product
            <select className={fieldClass} value={draft.product_id ?? ''} onChange={event => update({ product_id: event.target.value || null })}>
              <option value="">General customer story</option>
              {draft.product_id && !products.some(product => product.id === draft.product_id) && <option value={draft.product_id}>Unavailable product (not linked publicly)</option>}
              {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <ImageFilePicker label="Customer photo (optional)" file={file} disabled={busy} onChange={async event => {
            const next = event.target.files?.[0]; if (!next) return;
            setBusy(true); setError('');
            try {
              const encoded = await prepareTestimonialPhoto(next);
              setFile(next); setPhoto(encoded); setPreview(`data:image/webp;base64,${encoded}`); update({ has_image: true });
            } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to prepare photo.'); }
            finally { setBusy(false); }
          }} />
          <p className="text-xs">Upload a clean, cropped photo, not a WhatsApp screenshot. Photos are resized and metadata is removed. Draft photos remain private.</p>
          {draft.has_image && <><label className="block text-sm font-semibold">Photo description
            <input className={fieldClass} required maxLength={200} value={draft.image_alt} onChange={event => update({ image_alt: event.target.value })} />
          </label><button type="button" className="min-h-11 underline" onClick={() => {
            setPhoto(''); setPreview(undefined); setFile(null); update({ has_image: false, image_alt: '' });
          }}>Remove photo</button></>}
          <div className="space-y-3 rounded-xl border border-mustard/50 bg-cream p-4">
            <h3 className="font-semibold">Permission to publish</h3>
            <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.consent_confirmed}
              onChange={event => update({ consent_confirmed: event.target.checked, ...(!event.target.checked ? { published: false } : {}) })} />
              Customer explicitly permitted public use of this quote, display name and any photo.</label>
            <label className="block text-sm font-semibold">Permission date<input type="date" className={fieldClass} value={draft.consent_date ?? ''}
              max={localDate()} onChange={event => update({ consent_date: event.target.value || null })} /></label>
            <label className="block text-sm font-semibold">Permission source (private)
              <input className={fieldClass} maxLength={300} placeholder="For example: WhatsApp permission received on 1 November"
                value={draft.consent_source} onChange={event => update({ consent_source: event.target.value })} /></label>
            <p className="text-xs">Do not enter phone numbers or private chat contents here. Reconfirm permission if you change the quote, photo or public name.</p>
          </div>
          <label className="block text-sm font-semibold">Display order<input type="number" className={fieldClass} min={0} max={9999} step={1}
            value={draft.sort_order} onChange={event => update({ sort_order: Number(event.target.value) })} /></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.featured}
            onChange={event => update({ featured: event.target.checked })} />Feature on homepage</label>
          <label className="block text-sm font-semibold">Visibility<select className={fieldClass} value={draft.published ? 'published' : 'draft'}
            onChange={event => update({ published: event.target.value === 'published' })}>
            <option value="draft">Draft - private</option><option value="published">Published - public</option>
          </select></label>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button className={buttonClass}>{busy ? 'Saving...' : 'Save testimonial'}</button>
        </fieldset>
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start">
          <h3 className="font-heading text-xl font-bold">Website preview</h3>
          <p className="text-xs">Preview only. Nothing appears publicly until you save it as Published with permission recorded.</p>
          <TestimonialCard key={`${draft.id}-${draft.has_image}`} entry={{ ...draft, display_name: draft.display_name || 'Customer name',
            quote: draft.quote || 'Your customer quote will appear here.' }} product={products.find(product => product.id === draft.product_id)} imageUrl={preview} />
        </aside>
      </form>
    </AdminDialog>}
    {deleteEntry && <AdminDialog title="Delete testimonial" busy={busy} onClose={() => setDeleteEntry(null)}>
      <div className="space-y-4 p-5"><p>Delete the story from {deleteEntry.display_name}, including its stored photo and permission record? This cannot be undone.</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button className={buttonClass} disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { await repository.remove(deleteEntry); setDeleteEntry(null); setNotice('Testimonial deleted.'); setRetry(value => value + 1); }
          catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to delete testimonial.'); }
          finally { setBusy(false); }
        }}>Confirm delete</button>
      </div>
    </AdminDialog>}
  </section>;
}
