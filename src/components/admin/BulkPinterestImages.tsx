import { useEffect, useMemo, useRef, useState } from 'react';
import type { ManagedProduct } from '../../services/products';
import { getPinterestImage, savePinterestImage } from '../../services/pinterestImages';
import { buildProductImagePrompt } from '../../utils/productImagePrompt';
import { getProductImageUrl } from '../../utils/productImageUrl';
import { makePinterestDownload } from './pinterestPhotoDownload';
import ImageFilePicker, { ImagePickerHandIcon } from './ImageFilePicker';

interface Props {
  products: ManagedProduct[];
  shownProducts: ManagedProduct[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}

interface QueuedImage {
  id: string;
  file: File;
  variantId: string;
  error?: string;
}

const filenameKey = (name: string) => name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');

function ImagePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    if (image.current) image.current.src = preview;
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return <img ref={image} alt={`Selected ${file.name}`} className="h-24 w-auto rounded-lg" />;
}

export default function BulkPinterestImages({ products, shownProducts, disabled, onBusyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const variants = useMemo(() => products.flatMap(product => product.variants.map(variant => ({
    ...variant, productName: product.name, label: `${product.name} - ${variant.name}`,
  }))), [products]);
  const shownIds = new Set(shownProducts.flatMap(product => product.variants.map(variant => variant.id)));
  const shownVariants = variants.filter(variant => shownIds.has(variant.id));
  const generated = generatedIds.flatMap(id => {
    const variant = variants.find(item => item.id === id);
    return variant ? [variant] : [];
  });
  const promptFor = (variant: typeof variants[number]) =>
    buildProductImagePrompt('', 'pinterest', variant.name);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Prompt copied. Attach the matching original photo when using it.');
      setError('');
    } catch {
      setError('Unable to copy automatically. Select and copy the prompt text.');
    }
  };

  const addFiles = (files: File[]) => {
    const added = files.map(file => {
      const key = filenameKey(file.name.replace(/\.[^.]+$/, ''));
      const matches = variants.filter(variant => key !== '' && (
        key === filenameKey(variant.id) || key === filenameKey(variant.label)
        || key.endsWith(filenameKey(variant.id))
      ));
      return { id: crypto.randomUUID(), file, variantId: matches.length === 1 ? matches[0].id : '' };
    });
    setQueue(current => [...current, ...added]);
    setStatus('');
    setError('');
  };

  const assigned = queue.filter(item => variants.some(variant => variant.id === item.variantId));
  const duplicateIds = new Set(assigned.filter((item, index) =>
    assigned.findIndex(other => other.variantId === item.variantId) !== index).map(item => item.variantId));

  const save = async () => {
    if (busy || disabled || !assigned.length || duplicateIds.size) return;
    setBusy(true);
    onBusyChange(true);
    setStatus('');
    setError('');
    let saved = 0;
    try {
      for (const [index, item] of assigned.entries()) {
        setStatus(`Saving ${index + 1} of ${assigned.length}: ${item.file.name}`);
        try {
          const previous = await getPinterestImage(item.variantId);
          await savePinterestImage(item.variantId, item.file, previous);
          saved += 1;
          setQueue(current => current.filter(queued => queued.id !== item.id));
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : 'Unable to save this photo.';
          setQueue(current => current.map(queued => queued.id === item.id ? { ...queued, error: message } : queued));
        }
      }
      setStatus(`${saved} of ${assigned.length} photos saved. Failed or unassigned photos remain in the queue. Feeds update after the site rebuild.`);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const download = async () => {
    const batch = variants.filter(variant => selected.has(variant.id));
    if (busy || disabled || !batch.length) return;
    if (batch.length > 100) {
      setError('Select at most 100 variants per download.');
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setStatus('');
    setError('');
    try {
      const archive = await makePinterestDownload(batch, setStatus);
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: 'application/zip' }));
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'pinterest-source-photos-and-prompts.zip';
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setStatus(`Downloaded ${batch.length} website photos and matching prompts. Review each generated portrait before uploading.`);
    } catch (failure) {
      setStatus('');
      setError(failure instanceof Error ? failure.message : 'Unable to download the photos.');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return <section className="my-4 rounded-xl border border-mustard/50 bg-cream/40 p-4">
    <button type="button" disabled={busy} aria-expanded={open} onClick={() => setOpen(current => !current)}
      className="flex w-full items-center justify-between gap-3 text-left font-semibold text-cocoa underline-offset-4 hover:underline disabled:opacity-50">
      <span>Bulk Pinterest photos and prompts</span><span aria-hidden="true">{open ? '-' : '+'}</span>
    </button>
    {open && <>
      <p className="my-2 text-sm text-cocoa/70">
        Select variants from the current product results to download their website photos and matching prompts.
        Use each prompt with its matching photo and review the result.
        Choose multiple finished portraits, check their product assignments, then save them together.
        Saving replaces any existing Pinterest photo for that variant; website photos stay unchanged.
        Each portrait must be JPEG, PNG or WebP, 2:3, at least 1000 x 1500 pixels and at most 20 MB.
      </p>
      {disabled && !busy && <p role="status" className="text-sm">Finish the current product operation before using bulk Pinterest photos.</p>}
      <fieldset disabled={disabled || busy} className="space-y-2">
        <div className="flex gap-3 text-sm">
          <button type="button" className="underline" onClick={() => setSelected(current => new Set([...current, ...shownIds]))}>Select all shown variants</button>
          <button type="button" className="underline" onClick={() => setSelected(new Set())}>Clear variants</button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {shownVariants.map(variant => <label key={variant.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.has(variant.id)} onChange={event => {
              setSelected(current => {
                const next = new Set(current);
                if (event.target.checked) next.add(variant.id); else next.delete(variant.id);
                return next;
              });
            }} />
            <img src={getProductImageUrl(variant.image, 160)} alt="" className="h-12 w-12 rounded-lg object-cover" />
            {variant.label}
          </label>)}
          {!shownVariants.length && <p className="text-sm">No variants in the current product results.</p>}
        </div>
        <p className="text-xs">{selected.size} variants selected.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!selected.size} onClick={() => setGeneratedIds(variants.filter(variant => selected.has(variant.id)).map(variant => variant.id))}
            className="rounded-full bg-mustard px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50">Generate selected prompts</button>
          <button type="button" disabled={!selected.size} onClick={() => void download()}
            className="rounded-full border border-cocoa px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50">Download selected photos and prompts</button>
        </div>
        {generated.length > 0 && <div className="space-y-3">
          <button type="button" className="block text-sm underline" onClick={() => void copy(generated.map(variant => `${variant.label}\n${promptFor(variant)}`).join('\n\n'))}>
            Copy all prompts
          </button>
          {generated.map(variant => <div key={variant.id} className="rounded-lg border border-mustard/40 bg-white p-3">
            <p className="font-semibold">{variant.label}</p>
            <a href={variant.image} target="_blank" rel="noopener noreferrer" className="text-xs underline">Open website photo</a>
            <label className="block text-sm">Prompt for {variant.label}
              <textarea readOnly value={promptFor(variant)} rows={4} className="mt-1 w-full rounded-lg border border-mustard/50 p-2" />
            </label>
            <button type="button" className="text-sm underline" onClick={() => void copy(promptFor(variant))}>Copy prompt for {variant.label}</button>
          </div>)}
        </div>}
        <div className="border-t border-mustard/30 pt-3">
          <ImageFilePicker label="Choose Pinterest photos" file={null} multiple maxSizeMB={20}
            icon={<ImagePickerHandIcon />}
            onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          <p className="mt-1 text-xs">Files keeping the downloaded name or named Product - Variant are matched when unique. Check every assignment.</p>
        </div>
        {queue.map(item => <div key={item.id} className="rounded-lg border border-mustard/40 bg-white p-3">
          <div className="flex flex-wrap items-start gap-3">
            <ImagePreview file={item.file} />
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-semibold">{item.file.name}</p>
              <label className="block text-sm">Product variant for {item.file.name}
                <select value={item.variantId} onChange={event => {
                  const variantId = event.target.value;
                  setQueue(current => current.map(queued => queued.id === item.id ? { ...queued, variantId, error: undefined } : queued));
                }} className="mt-1 block w-full rounded-lg border border-mustard/50 p-2">
                  <option value="">Choose product and variant</option>
                  {variants.map(variant => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
                </select>
              </label>
              {duplicateIds.has(item.variantId) && <p role="alert" className="text-xs text-red-700">Only one photo can be assigned to each variant.</p>}
              {item.variantId && !variants.some(variant => variant.id === item.variantId) &&
                <p role="alert" className="text-xs text-red-700">This variant is no longer available. Choose another variant or remove the photo.</p>}
              {item.error && <p role="alert" className="text-xs text-red-700">{item.error}</p>}
              <button type="button" className="mt-1 text-xs underline" onClick={() => setQueue(current => current.filter(queued => queued.id !== item.id))}>Remove {item.file.name}</button>
            </div>
          </div>
        </div>)}
        {queue.length > 0 && <button type="button" disabled={!assigned.length || duplicateIds.size > 0}
          onClick={() => void save()} className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">
          Save {assigned.length} assigned Pinterest photos
        </button>}
      </fieldset>
      {status && <p role="status" className="mt-2 text-sm">{status}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </>}
  </section>;
}
