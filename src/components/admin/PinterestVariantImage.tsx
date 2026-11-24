import { useEffect, useState } from 'react';
import { getPinterestImage, removePinterestImage, savePinterestImage, type PinterestImage } from '../../services/pinterestImages';

export default function PinterestVariantImage({ variantId, variantName }: { variantId: string; variantName: string }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<PinterestImage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const load = async () => {
    setOpen(true);
    setBusy(true);
    setLoaded(false);
    setError('');
    try { setImage(await getPinterestImage(variantId)); setLoaded(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load the Pinterest image.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await savePinterestImage(variantId, file, image);
      setImage(saved);
      setFile(null);
      setMessage('Pinterest image saved. The feeds update after the site rebuild.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the Pinterest image.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!image) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await removePinterestImage(variantId, image);
      setImage(null);
      setMessage('Pinterest image removed. The feeds will use the standard image after the site rebuild.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to remove the Pinterest image.');
    } finally { setBusy(false); }
  };

  if (!open) return <button type="button" onClick={() => void load()}
    className="text-sm font-semibold text-cocoa underline">Pinterest photo</button>;

  return <section className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3" aria-label={`Pinterest photo for ${variantName}`}>
    <div className="flex items-center justify-between gap-2">
      <h5 className="text-sm font-semibold">Pinterest photo</h5>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setFile(null); setError(''); setMessage(''); }}
        className="text-xs font-semibold underline disabled:opacity-50">Close</button>
    </div>
    <p className="mt-1 text-xs">Upload a reviewed 2:3 portrait of this exact variant, at least 1000 x 1500 pixels. It is stored as optimized WebP in R2; the website image stays unchanged.</p>
    {image && <img src={image.image_url} alt={`Saved Pinterest photo for ${variantName}`} className="mt-2 h-32 w-auto rounded-lg" />}
    {file && preview && <img src={preview} alt={`Selected Pinterest photo for ${variantName}`} className="mt-2 h-32 w-auto rounded-lg" />}
    <label className="mt-2 block text-xs font-semibold">Choose Pinterest photo for {variantName}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setMessage(''); event.target.value = ''; }}
        className="mt-1 block w-full text-xs" />
    </label>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !loaded || !file} onClick={() => void save()}
        className="rounded-full bg-cocoa px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-50">
        {busy ? 'Working…' : 'Save Pinterest photo'}
      </button>
      {image && <button type="button" disabled={busy} onClick={() => void remove()}
        className="rounded-full border border-cocoa/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Remove Pinterest photo</button>}
      {error && <button type="button" disabled={busy} onClick={() => void load()}
        className="text-xs font-semibold underline disabled:opacity-50">Reload saved photo</button>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-xs text-green-700">{message}</p>}
  </section>;
}
