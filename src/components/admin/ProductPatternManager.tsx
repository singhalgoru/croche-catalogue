import { useCallback, useEffect, useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import { downloadProductPattern, fetchPatternWorkspace, queuePatternEmail, removeProductPattern,
  uploadProductPattern, validatePatternFile, type PatternWorkspace } from '../../services/productPatterns';
import type { PatternLanguage, PatternProduct, PreparedPattern } from '../../services/patternDocuments';

const buttonClass = 'min-h-11 rounded-full border border-cocoa/30 px-4 py-2 text-sm font-semibold disabled:opacity-50';

export default function ProductPatternManager({ product, disabled = false }: {
  product: PatternProduct;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" disabled={disabled} className={buttonClass} onClick={() => setOpen(true)}>Artisan pattern</button>
    {open && <PatternDialog key={product.id} product={product} onClose={() => setOpen(false)} />}
  </>;
}

function PatternDialog({ product, onClose }: { product: PatternProduct; onClose: () => void }) {
  const [workspace, setWorkspace] = useState<PatternWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<PatternLanguage>('en');
  const [source, setSource] = useState<'upload' | 'write'>('upload');
  const [instructions, setInstructions] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const prepared = useRef<PreparedPattern | null>(null);
  const uploadRevision = useRef(crypto.randomUUID());
  const emailRequest = useRef(crypto.randomUUID());
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const selected = workspace?.recipients.find(row => row.id === recipient);
  const refresh = useCallback(async () => {
    setConfirmed(false); setRemoving(false);
    setWorkspace(await fetchPatternWorkspace(product.id));
  }, [product.id]);
  useEffect(() => {
    let active = true;
    void fetchPatternWorkspace(product.id).then(data => {
      if (active) { setWorkspace(data); setLoading(false); }
    }, reason => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Unable to load patterns.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [product.id]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (reason) { setNotice(''); setError(reason instanceof Error ? reason.message : 'Pattern action failed.'); }
    finally { setBusy(false); }
  };
  const resetEmail = () => { emailRequest.current = crypto.randomUUID(); setConfirmed(false); };
  const resetPreparation = () => { prepared.current = null; uploadRevision.current = crypto.randomUUID(); setWarnings([]); };
  return <AdminDialog title={`Artisan pattern - ${product.name}`} busy={busy} onClose={onClose}>
    <section aria-label="Product artisan pattern" className="space-y-4 p-4">
      <p className="text-sm">Private working pattern; never shown in the public catalogue.
        Create instructions here in English or Hindi, or import Word content. Preparation adds centred branding,
        a copyright warning, this product's page link and main photo to editable Word and print-restricted PDF copies.
        Pattern ID starts with the product name and uses its SKU (or existing product ID). Prepared by is always Luvia Creations.</p>
      <a href="/templates/Luvia_Standard_Crochet_Pattern_v4.docx" download className="inline-block min-h-11 py-2 font-semibold underline">
        Download Luvia Word template
      </a>
      <a href="/templates/Luvia_Standard_Crochet_Pattern_Hindi_v4.docx" download className="ml-3 inline-block min-h-11 py-2 font-semibold underline">
        Download Hindi Word template
      </a>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {loading && <p role="status">Loading private pattern…</p>}
      <button type="button" className={buttonClass} disabled={busy || loading}
        onClick={() => void action(refresh)}>Refresh pattern and email status</button>
      {workspace && <fieldset disabled={busy} className="space-y-4">
        <legend className="font-heading text-lg font-bold">Product pattern documents</legend>
        {workspace.pattern ? <div className="space-y-2 rounded-xl border border-mustard p-3">
          <p className="break-all font-semibold">{workspace.pattern.filename}</p>
          <p className="text-sm">{Math.ceil(workspace.pattern.size / 1024)} KB · Updated {new Date(workspace.pattern.updated_at).toLocaleString()}</p>
          <p className="break-all text-sm">Artisan PDF: {workspace.pattern.pdf_filename} · {workspace.pattern.language === 'hi' ? 'हिन्दी' : 'English'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => void action(async () => {
              await downloadProductPattern(product.id, workspace.pattern!.revision);
            })}>Download attached pattern</button>
            <button type="button" className={buttonClass} onClick={() => void action(async () => {
              await downloadProductPattern(product.id, workspace.pattern!.revision, 'pdf');
            })}>Review / download protected PDF</button>
            <button type="button" className={buttonClass} onClick={() => setRemoving(true)}>Remove pattern</button>
          </div>
          {removing && <div>
            <p className="my-2 text-sm">Remove this product's pattern? Previously queued emails keep their attachment.</p>
            <button type="button" className={buttonClass} onClick={() => void action(async () => {
              await removeProductPattern(product.id, workspace.pattern!.revision);
              setRemoving(false); resetEmail(); setNotice('Pattern removed. Previously queued emails are unchanged.'); await refresh();
            })}>Confirm removal</button>
            <button type="button" className={buttonClass} onClick={() => setRemoving(false)}>Keep pattern</button>
          </div>}
        </div> : <p>No pattern attached.</p>}
        <label className="block text-sm font-semibold">Document language
          <select value={language} className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2"
            onChange={event => { setLanguage(event.target.value === 'hi' ? 'hi' : 'en'); resetPreparation(); }}>
            <option value="en">English</option><option value="hi">हिन्दी (Hindi)</option>
          </select>
        </label>
        <p className="text-sm">Hindi sets the document headings and copyright notice, with a Devanagari font.
          Write or upload Hindi instructions; this does not automatically translate existing English text.</p>
        <label className="block text-sm font-semibold">Pattern source
          <select value={source} className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2"
            onChange={event => { setSource(event.target.value === 'write' ? 'write' : 'upload'); resetPreparation(); }}>
            <option value="upload">Import Word document</option><option value="write">Write instructions in admin</option>
          </select>
        </label>
        {source === 'write' ? <label className="block text-sm font-semibold">
          {language === 'hi' ? 'पैटर्न के निर्देश (हिन्दी)' : 'Pattern instructions'}
          <textarea rows={12} maxLength={60000} lang={language} value={instructions}
            className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2 font-normal"
            onChange={event => { setInstructions(event.target.value); resetPreparation(); }} />
        </label> : <label className="block text-sm font-semibold">Choose Word pattern (.docx, up to 2 MB)
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="mt-2 block w-full text-sm" onChange={event => {
              const next = event.target.files?.[0];
              event.target.value = '';
              if (!next) return;
              setError('');
              try { validatePatternFile(next); setFile(next); resetPreparation(); }
              catch (reason) { setFile(null); setError(reason instanceof Error ? reason.message : 'Invalid pattern.'); }
            }} />
        </label>}
        {source === 'upload' && file && <p className="break-all text-sm">Selected: {file.name}</p>}
        <p className="text-sm">Imported content is reformatted into the standard layout. Check both documents before sharing,
          especially tables and diagrams. Horizontal merged table headings are supported; unmerge vertical cells before importing.
          Only the PDF is emailed; the editable Word master stays private.
          PDF permissions allow printing and restrict copying/editing in compliant readers, but cannot prevent screenshots,
          OCR, printing to another PDF or tools that ignore permissions.</p>
        <button type="button" className={buttonClass} disabled={source === 'upload' ? !file : !instructions.trim()}
          onClick={() => void action(async () => {
            if (!prepared.current) {
              const { preparePatternDocuments } = await import('../../services/patternDocuments');
              prepared.current = await preparePatternDocuments(product, language, source === 'upload' ? file! : instructions, setNotice);
            }
            setWarnings(prepared.current.warnings);
            await uploadProductPattern(product.id, workspace.pattern?.revision ?? null, uploadRevision.current, prepared.current, language);
            setFile(null); setInstructions(''); prepared.current = null; resetEmail();
            setNotice('Word master and protected PDF saved privately. No email has been sent. Review the PDF before sharing.'); await refresh();
          })}>{workspace.pattern ? 'Prepare and replace pattern documents' : 'Prepare and attach pattern documents'}</button>
        {warnings.length > 0 && <div role="alert" className="text-sm">
          <p>Word import reported these conversion warnings. Review the generated documents before sharing:</p>
          <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </div>}
        {workspace.pattern && <fieldset className="space-y-3 rounded-xl border border-cocoa/20 p-3">
          <legend className="font-semibold">Share with an onboarded artisan</legend>
          <p className="text-sm">Only Approved artisans with an application email can receive patterns.
            No email is sent when uploading or replacing a document.</p>
          {!workspace.recipients.length ? <p>No eligible artisans. Approve an artisan with an email in the Artisans workspace first.</p> : <>
            <label className="block text-sm font-semibold">Artisan
              <select className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2" value={recipient}
                onChange={event => { setRecipient(event.target.value); resetEmail(); }}>
                <option value="">Choose an Approved artisan</option>
                {workspace.recipients.map(row => <option key={row.id} value={row.id}>{row.name} — {row.email}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Message to artisan (optional)
              <textarea rows={3} maxLength={1500} value={message} className="mt-1 block w-full rounded-lg border border-cocoa/30 p-2"
                onChange={event => { setMessage(event.target.value); resetEmail(); }} />
            </label>
            {selected && <div className="space-y-2 rounded-lg bg-cream-dark p-3 text-sm">
              <p>To: <strong>{selected.name} ({selected.email})</strong></p>
              <p className="break-all">PDF attachment: {workspace.pattern.pdf_filename}</p>
              <p>The email includes your message and asks the artisan to wait for separately agreed batch terms.</p>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                I have reviewed the protected PDF and recipient and want to email this PDF only.
              </label>
            </div>}
            <button type="button" className={buttonClass} disabled={!confirmed || !selected}
              onClick={() => void action(async () => {
                await queuePatternEmail(product.id, workspace.pattern!.revision, recipient, emailRequest.current, message);
                setNotice('Pattern email queued. Refresh status to check provider acceptance; inbox delivery is not guaranteed.');
                setConfirmed(false); emailRequest.current = crypto.randomUUID(); await refresh();
              })}>Queue pattern email</button>
          </>}
        </fieldset>}
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Recent pattern emails</summary>
          <p className="mb-2 text-sm">Latest 20 requests, retained for up to 30 days after completion. Provider acceptance does not confirm inbox delivery.</p>
          {!workspace.emails.length && <p className="text-sm">No pattern emails queued.</p>}
          <ul className="space-y-2">
            {workspace.emails.map(email => <li key={email.id} className="break-words rounded-lg border border-cocoa/20 p-3 text-sm">
              <p>{email.recipient_email} · {email.filename}</p>
              <p>{new Date(email.created_at).toLocaleString()} · {email.accepted_at ? 'Accepted by email provider'
                : email.attempts >= 8 ? 'Stopped — contact operations before retrying'
                  : email.last_error ? 'Retry scheduled' : 'Queued / processing'}</p>
              {email.last_error && <p className="text-red-700">{email.last_error}</p>}
            </li>)}
          </ul>
        </details>
      </fieldset>}
    </section>
  </AdminDialog>;
}
