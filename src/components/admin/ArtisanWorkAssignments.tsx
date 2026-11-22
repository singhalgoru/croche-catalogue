import { useEffect, useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import { fetchPatternProductIds, fetchPatternWorkspace, type ProductPattern } from '../../services/productPatterns';
import { completeWorkAssignment, createWorkAssignment, listWorkAssignments, type WorkAssignment, type WorkDraft } from '../../services/artisanWork';
import { buildArtisanWorkEmail, workPaymentSummary, WORK_QUALITY_TERMS, type WorkOffer } from '../../../supabase/functions/_shared/artisanWorkEmail';

type Item = { key: string; productId: string; name: string; quantity: string; rateWithYarn: string;
  rateWithoutYarn: string; yarnBasis: '' | 'with' | 'without'; pattern: ProductPattern | null; loadingPattern: boolean };
const newItem = (): Item => ({ key: crypto.randomUUID(), productId: '', name: '', quantity: '',
  rateWithYarn: '', rateWithoutYarn: '', yarnBasis: '', pattern: null, loadingPattern: false });
const button = 'min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'mt-1 block min-h-11 w-full rounded border border-cocoa/30 p-2 font-normal';

export default function ArtisanWorkAssignments({ artisan, onClose }: {
  artisan: { id: string; name: string; email: string | null; approved: boolean }; onClose: () => void;
}) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [patternIds, setPatternIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<WorkAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [subject, setSubject] = useState('Your Luvia work assignment');
  const [message, setMessage] = useState('We would like to assign you the following crochet work. Please review the details and accept if you agree.');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [courierCap, setCourierCap] = useState('');
  const [advancePercent, setAdvancePercent] = useState('0');
  const [items, setItems] = useState<Item[]>(() => [newItem()]);
  const [preview, setPreview] = useState<{ draft: WorkDraft; offer: WorkOffer } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const refresh = async () => setHistory(await listWorkAssignments(artisan.id));
  useEffect(() => {
    let active = true;
    void Promise.all([fetchManagedProducts(), fetchPatternProductIds(), listWorkAssignments(artisan.id)]).then(([catalogue, patterns, assignments]) => {
      if (active) { setProducts(catalogue); setPatternIds(patterns); setHistory(assignments); setWorkspaceReady(true); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load assignment workspace.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artisan.id]);
  const update = (key: string, change: Partial<Item>) => setItems(current => current.map(item => item.key === key ? { ...item, ...change } : item));
  const createPreview = () => {
    if (!artisan.email) throw new Error('This artisan has no application email. Add an email before assigning work.');
    if (!subject.trim() || subject.length > 150 || /[\r\n]/.test(subject) || !message.trim() || message.length > 3000
      || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || !/^\d{1,7}(\.\d{1,2})?$/.test(courierCap)
      || !/^\d{1,3}(\.\d{1,2})?$/.test(advancePercent) || Number(advancePercent) > 100) {
      throw new Error('Check the subject, message, delivery date, courier cap and advance percentage (0 to 100).');
    }
    if (items.some(item => item.loadingPattern || !item.name.trim() || !/^\d{1,5}$/.test(item.quantity)
      || Number(item.quantity) < 1 || !/^\d{1,7}(\.\d{1,2})?$/.test(item.rateWithYarn)
      || !/^\d{1,7}(\.\d{1,2})?$/.test(item.rateWithoutYarn) || !item.yarnBasis)) {
      throw new Error('Check every product, quantity, per-unit price, agreed rate and selected pattern.');
    }
    const draft: WorkDraft = { recipientName: artisan.name, recipientEmail: artisan.email,
      subject: subject.trim(), message: message.trim(), deliveryDate, courierCap: Number(courierCap), advancePercent: Number(advancePercent),
      items: items.map(item => {
        if (!item.yarnBasis) throw new Error('Select the agreed rate for every product.');
        return { productId: item.productId || null, name: item.name.trim(), quantity: Number(item.quantity),
          rateWithYarn: Number(item.rateWithYarn), rateWithoutYarn: Number(item.rateWithoutYarn),
          yarnBasis: item.yarnBasis, patternRevision: item.pattern?.revision ?? null };
      }) };
    const offer: WorkOffer = { recipientName: artisan.name, subject: draft.subject, message: draft.message,
      deliveryDate, courierCap: draft.courierCap, advancePercent: draft.advancePercent, qualityTerms: WORK_QUALITY_TERMS,
      reference: requestId.current, items: draft.items.map((item, index) => ({
        name: item.name, quantity: item.quantity, rateWithYarn: item.rateWithYarn, rateWithoutYarn: item.rateWithoutYarn,
        yarnBasis: item.yarnBasis, patternFilename: items[index]!.pattern?.pdf_filename ?? null,
      })) };
    setPreview({ draft, offer });
  };
  const action = async (work: () => Promise<void>) => {
    setError(''); setNotice(''); setBusy(true);
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Assignment action failed.'); }
    finally { setBusy(false); }
  };
  return <AdminDialog title={`Assign work - ${artisan.name}`} onClose={onClose} busy={busy}>
    <div className="space-y-5 p-4">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Loading assignment workspace...</p> : workspaceReady ? <>
        <section className="space-y-3" aria-label="Work assignments">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading text-lg font-bold">Assignment history</h3>
            <button type="button" className={button} disabled={busy} onClick={() => void action(refresh)}>Refresh status</button></div>
          {history.length === 0 ? <p className="text-sm">No assignments yet.</p> : history.map(entry => <article key={entry.id} className="space-y-2 rounded-xl border border-mustard/40 p-3 text-sm">
            <p className="font-semibold">{entry.offer.items.map(item => `${item.name} (${item.quantity})`).join(', ')}</p>
            <p className="break-all">Reference: {entry.id}</p>
            <p>Status: <strong>{entry.completedAt ? 'Completed' : entry.acceptedAt ? 'Work in progress'
              : new Date(entry.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Awaiting artisan acceptance'}</strong> · Delivery: {entry.offer.deliveryDate}</p>
            <p>Assignment email: {entry.offerSentAt ? 'accepted by email provider (delivery not guaranteed)' : entry.offerAttempts >= 8 ? 'delivery stopped; investigate before sending again' : 'queued / retrying'}
              {entry.offerError && ` — ${entry.offerError}`}</p>
            {entry.acceptedAt && <p>Confirmation email to info@luviacreations.com: {entry.confirmationSentAt ? 'accepted by email provider' : (entry.confirmationAttempts ?? 0) >= 8 ? 'delivery stopped; investigate' : 'queued / retrying'}
              {entry.confirmationError && ` — ${entry.confirmationError}`}</p>}
            <details><summary className="cursor-pointer underline">View agreed terms</summary>
              <p className="whitespace-pre-wrap">{entry.offer.message}</p>
              {entry.offer.items.map((item, index) => <p key={index}>{item.name}: {item.quantity} units; including yarn INR {item.rateWithYarn.toFixed(2)}/unit;
                excluding yarn INR {item.rateWithoutYarn.toFixed(2)}/unit{item.yarnBasis ? `; agreed rate: ${item.yarnBasis === 'with' ? 'including yarn' : 'excluding yarn'}` : ''}{item.patternFilename ? `; pattern: ${item.patternFilename}` : ''}</p>)}
              <p>Maximum courier reimbursement: INR {entry.offer.courierCap.toFixed(2)}</p>
              {workPaymentSummary(entry.offer) && <p>Total work payment: {workPaymentSummary(entry.offer)!.total};
                advance ({entry.offer.advancePercent}%): {workPaymentSummary(entry.offer)!.advance};
                balance after completion: {workPaymentSummary(entry.offer)!.balance}. Courier reimbursement is separate.</p>}
              {entry.offer.qualityTerms && <p>Quality and returns: {entry.offer.qualityTerms}</p>}
            </details>
            {entry.acceptedAt && !entry.completedAt && (confirmComplete === entry.id ? <div className="space-x-2">
              <span>Mark this assignment completed?</span>
              <button type="button" className={button} disabled={busy} onClick={() => void action(async () => {
                await completeWorkAssignment(entry.id); await refresh(); setConfirmComplete(null); setNotice('Assignment marked completed.');
              })}>Confirm completion</button>
              <button type="button" className={button} disabled={busy} onClick={() => setConfirmComplete(null)}>Cancel</button>
            </div> : <button type="button" className={button} disabled={busy}
              onClick={() => setConfirmComplete(entry.id)}>Mark work complete</button>)}
          </article>)}
        </section>
        <hr className="border-mustard/40" />
        {!artisan.approved ? <p className="text-sm">New assignments can only be sent to approved artisans. Existing work can still be completed here.</p>
          : !preview ? <form className="space-y-4" onSubmit={event => {
          event.preventDefault(); setError(''); try { createPreview(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check assignment details.'); }
        }}>
          <h3 className="font-heading text-lg font-bold">New assignment</h3>
          <p className="text-sm">Email to: {artisan.email ?? 'No application email available'}. Rates are per unit; courier reimbursement is a maximum for the assignment.</p>
          {items.map((item, index) => <fieldset key={item.key} className="space-y-3 rounded-xl border border-mustard/40 p-3">
            <legend className="font-semibold">Product {index + 1}</legend>
            <label className="block text-sm font-semibold">Catalogue product or manual entry<select className={input} value={item.productId}
              onChange={event => {
                const product = products.find(row => row.id === event.target.value);
                update(item.key, { productId: product?.id ?? '', name: product?.name ?? '', pattern: null, loadingPattern: false });
              }}><option value="">Enter product manually</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.name}{product.published ? '' : ' (unpublished)'}</option>)}
            </select></label>
            {!item.productId && <label className="block text-sm font-semibold">Product name<input className={input} required maxLength={100}
              value={item.name} onChange={event => update(item.key, { name: event.target.value })} /></label>}
            {item.productId && <div className="text-sm">{patternIds.has(item.productId) ? <label className="flex items-center gap-2">
              <input type="checkbox" checked={item.pattern !== null || item.loadingPattern} disabled={item.loadingPattern}
                onChange={event => {
                  if (!event.target.checked) { update(item.key, { pattern: null }); return; }
                  const productId = item.productId;
                  update(item.key, { loadingPattern: true });
                  void fetchPatternWorkspace(productId).then(workspace => {
                    if (!workspace.pattern) throw new Error('Pattern was removed. Refresh the workspace.');
                    setItems(current => current.map(row => row.key === item.key && row.productId === productId
                      ? { ...row, pattern: workspace.pattern, loadingPattern: false } : row));
                  }).catch(reason => { update(item.key, { pattern: null, loadingPattern: false });
                    setError(reason instanceof Error ? reason.message : 'Unable to load pattern.'); });
                }} />
              {item.loadingPattern ? 'Loading pattern...' : item.pattern ? `Attach ${item.pattern.pdf_filename}` : 'Attach available PDF pattern'}
            </label> : <p>No pattern attached to this product.</p>}</div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-semibold">Quantity<input type="number" min="1" max="99999" step="1" required className={input}
                value={item.quantity} onChange={event => update(item.key, { quantity: event.target.value })} /></label>
              <label className="block text-sm font-semibold">Including yarn / unit (INR)<input type="number" min="0" max="9999999" step="0.01" required className={input}
                value={item.rateWithYarn} onChange={event => update(item.key, { rateWithYarn: event.target.value })} /></label>
              <label className="block text-sm font-semibold">Excluding yarn / unit (INR)<input type="number" min="0" max="9999999" step="0.01" required className={input}
                value={item.rateWithoutYarn} onChange={event => update(item.key, { rateWithoutYarn: event.target.value })} /></label>
            </div>
            <label className="block text-sm font-semibold">Agreed rate for this product<select required className={input} value={item.yarnBasis}
              onChange={event => update(item.key, { yarnBasis: event.target.value === 'with' ? 'with' : event.target.value === 'without' ? 'without' : '' })}>
              <option value="">Select the applicable rate</option><option value="with">Including yarn</option><option value="without">Excluding yarn</option>
            </select></label>
            {items.length > 1 && <button type="button" className={button} onClick={() => setItems(current => current.filter(row => row.key !== item.key))}>Remove product</button>}
          </fieldset>)}
          <button type="button" className={button} disabled={items.length >= 10} onClick={() => setItems(current => [...current, newItem()])}>Add product</button>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Delivery date<input type="date" required className={input} value={deliveryDate} onChange={event => setDeliveryDate(event.target.value)} /></label>
            <label className="block text-sm font-semibold">Maximum courier reimbursement (INR)<input type="number" min="0" max="9999999" step="0.01" required className={input}
              value={courierCap} onChange={event => setCourierCap(event.target.value)} /></label>
          </div>
          <label className="block text-sm font-semibold">Advance payment (%)<input type="number" min="0" max="100" step="0.01" required className={input}
            value={advancePercent} onChange={event => setAdvancePercent(event.target.value)} /></label>
          <p className="text-sm">The preview shows the total, advance and remaining balance. Courier reimbursement is separate.</p>
          <p className="text-sm"><strong>Quality and returns:</strong> {WORK_QUALITY_TERMS}</p>
          <label className="block text-sm font-semibold">Email subject<input className={input} required maxLength={150} value={subject} onChange={event => setSubject(event.target.value)} /></label>
          <label className="block text-sm font-semibold">Email message<textarea className={input} rows={4} required maxLength={3000} value={message} onChange={event => setMessage(event.target.value)} /></label>
          <button disabled={busy || !artisan.email || items.some(item => item.loadingPattern)} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50">Preview email</button>
        </form> : <section className="space-y-3" aria-label="Assignment email preview">
          <h3 className="font-heading text-lg font-bold">Email preview</h3>
          <p className="text-sm">To: {artisan.email}<br />Subject: {preview.offer.subject}</p>
          <p className="text-sm">The real acceptance link is generated securely when queued. Selected PDFs will be attached.</p>
          <iframe title="Assignment email preview" sandbox="" srcDoc={buildArtisanWorkEmail(preview.offer, '#preview').html}
            className="h-[34rem] w-full rounded-lg border border-cocoa/30 bg-white" />
          {attempted && <p className="text-sm">If sending is uncertain, retry the same request. If it was already saved, changed terms will be rejected; check assignment history before creating a replacement.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={button} onClick={() => setPreview(null)}>Edit assignment</button>
            <button type="button" disabled={busy} className="min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-50"
              onClick={() => void action(async () => {
                setAttempted(true);
                await createWorkAssignment(requestId.current, artisan.id, preview.draft);
                setNotice('Assignment email queued. Provider delivery is not yet confirmed.');
                setPreview(null); setAttempted(false); requestId.current = crypto.randomUUID();
                setItems([newItem()]); setDeliveryDate(''); setCourierCap(''); setAdvancePercent('0');
                await refresh();
              })}>{busy ? 'Queueing...' : attempted ? 'Retry same assignment' : 'Send assignment email'}</button>
          </div>
        </section>}
      </> : <p>Close and reopen this window to retry loading the assignment workspace. No assignment has been sent.</p>}
    </div>
  </AdminDialog>;
}
