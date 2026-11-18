import { useEffect, useId, useState } from 'react';
import type { ManagedProduct } from '../../services/products';
import { preparePinterestPin, type PinterestImageLayout } from '../../utils/pinterestShare';
import { toProductPageUrl } from '../../utils/productLink';
import { richTextToPlainText } from '../../utils/richText';

export default function PinterestShare({ product, disabled, onBusyChange }: {
  product: ManagedProduct; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState(product.name.trim().slice(0, 100));
  const [description, setDescription] = useState(richTextToPlainText(product.description).slice(0, 500));
  const [layout, setLayout] = useState<PinterestImageLayout>('branded');
  const layoutGroup = useId();
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const blocked = disabled || busy;
  const valid = Boolean(title.trim() && title.length <= 100 && description.trim() && description.length <= 500);
  const link = `https://luviacreations.com${new URL(toProductPageUrl(product)).pathname}`;
  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const clearImage = () => {
    setPhoto(null); setPreviewUrl(''); setMessage(''); setError('');
  };
  const run = async (action: () => Promise<void>) => {
    if (blocked) return;
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try { await action(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to prepare the Pinterest pin. Nothing was published.');
    } finally { setBusy(false); onBusyChange(false); }
  };
  const copy = (value: string, field: string) => run(async () => {
    if (!navigator.clipboard) throw new Error('Clipboard is unavailable. Select and copy the Pinterest fields manually.');
    await navigator.clipboard.writeText(value.trim());
    setMessage(`${field} copied. Paste it in Pinterest and review before publishing.`);
  });
  const buttonClass = 'min-h-11 rounded-full border border-cocoa/30 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <section aria-label="Pinterest pin preparation" className="grid gap-3 rounded-xl border border-cocoa/25 bg-white p-3">
    <h3 className="font-semibold">Pinterest pin (manual publish)</h3>
    <p className="text-sm">No Pinterest API access or Meta check is needed. Download the branded 1000 x 1500 image,
      copy the fields below, then upload it in Pinterest, choose a board and publish there.
      Opening Pinterest does not transfer the image or text. This website cannot publish or verify a pin.</p>
    <label className="grid gap-1 text-sm font-semibold">Pinterest title ({title.length}/100)
      <input value={title} maxLength={100} disabled={blocked} className="min-h-11 rounded-xl border border-cocoa/25 px-3"
        onChange={event => {
          setTitle(event.target.value); clearImage();
        }} />
    </label>
    <label className="grid gap-1 text-sm font-semibold">Pinterest description ({description.length}/500)
      <textarea value={description} maxLength={500} rows={4} disabled={blocked}
        className="rounded-xl border border-cocoa/25 p-3 font-normal" onChange={event => {
          setDescription(event.target.value); setMessage(''); setError('');
        }} />
    </label>
    <label className="grid gap-1 text-sm font-semibold">Pinterest product link
      <input value={link} readOnly className="min-h-11 min-w-0 rounded-xl border border-cocoa/25 px-3 font-normal" />
    </label>
    <fieldset disabled={blocked} className="grid gap-1">
      <legend className="text-sm font-semibold">Pinterest image layout</legend>
      {([
        ['branded', 'Branded poster (title above photo)'],
        ['photo-first', 'Photo-first resize (larger original photo)'],
      ] as const).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name={layoutGroup} value={value} checked={layout === value}
          onChange={() => { setLayout(value); clearImage(); }} />
        {label}
      </label>)}
    </fieldset>
    <p className="text-sm">Both layouts resize to 1000 x 1500 (2:3), free and without AI.
      Photo-first makes the original photo larger. Neither layout crops, stretches or invents product details.
      Choose a different layout to prepare a new version.</p>
    <button type="button" className={buttonClass} disabled={blocked || !valid || Boolean(photo)}
      onClick={() => void run(async () => {
        const file = await preparePinterestPin(product, title.trim(), layout);
        const url = URL.createObjectURL(file);
        setPhoto(file); setPreviewUrl(url);
        setMessage('Pinterest image prepared locally. Nothing was uploaded or published. Review the image before posting.');
      })}>{busy && !photo ? 'Preparing Pinterest image...' : 'Prepare Pinterest image (does not publish)'}</button>
    {previewUrl && <img src={previewUrl} alt="Pinterest pin preview" className="max-h-96 max-w-full rounded-xl object-contain"
      onError={() => setError('The Pinterest preview could not load. Download and inspect the image before posting.')} />}
    <div className="flex flex-wrap gap-2">
      <a href={previewUrl || undefined} download={photo?.name} aria-disabled={!photo || blocked}
        className={`${buttonClass} ${!photo || blocked ? 'opacity-50' : ''}`}
        onClick={event => { if (!photo || blocked) event.preventDefault(); }}>Download Pinterest image</a>
      <button type="button" className={buttonClass} disabled={blocked || !valid}
        onClick={() => void copy(title, 'Pinterest title')}>Copy Pinterest title</button>
      <button type="button" className={buttonClass} disabled={blocked || !valid}
        onClick={() => void copy(description, 'Pinterest description')}>Copy Pinterest description</button>
      <button type="button" className={buttonClass} disabled={blocked}
        onClick={() => void copy(link, 'Pinterest product link')}>Copy Pinterest product link</button>
      {!blocked && <a href="https://www.pinterest.com/pin-creation-tool/" target="_blank" rel="noopener noreferrer"
        className={buttonClass}>Open Pinterest to create pin</a>}
    </div>
    <p className="text-sm">Drafts are not saved when this dialog closes. Review product claims, media rights and availability before posting.
      Pinterest board selection and publication happen in Pinterest, not through the Facebook/Instagram LIVE button.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
