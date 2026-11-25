import { useEffect, useState } from 'react';
import { getPinterestImage, removePinterestImage, savePinterestImage, type PinterestImage } from '../../services/pinterestImages';
import { PinterestIcon } from '../SocialIcons';
import { buildProductImagePrompt } from '../../utils/productImagePrompt';

export default function PinterestVariantImage({ variantId, variantName }: { variantId: string; variantName: string }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<PinterestImage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptCopyError, setPromptCopyError] = useState('');

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

  const generatePrompt = () => {
    setPrompt(buildProductImagePrompt('', 'pinterest', variantName));
    setPromptCopied(false);
    setPromptCopyError('');
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setPromptCopyError('');
    } catch {
      setPromptCopied(false);
      setPromptCopyError('Unable to copy automatically. Select and copy the prompt above.');
    }
  };

  if (!open) return <button type="button" onClick={() => void load()}
    className="inline-flex items-center gap-1.5 text-sm font-semibold text-cocoa underline decoration-[#E60023] decoration-2 underline-offset-4 hover:text-[#B0001B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E60023]">
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E60023] text-white"><PinterestIcon className="h-4 w-4" /></span>
    Pinterest photo
  </button>;

  return <section className="mt-3 rounded-xl border border-mustard/30 bg-cream/40 p-3" aria-label={`Pinterest photo for ${variantName}`}>
    <div className="flex items-center justify-between gap-2">
      <h5 className="inline-flex items-center gap-2 text-sm font-semibold underline decoration-[#E60023] decoration-2 underline-offset-4">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#E60023] text-white"><PinterestIcon /></span>
        Pinterest photo
      </h5>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setFile(null); setError(''); setMessage(''); }}
        className="text-xs font-semibold underline disabled:opacity-50">Close</button>
    </div>
    <p className="mt-1 text-xs">Upload a reviewed 2:3 portrait of this exact variant, at least 1000 x 1500 pixels. The prompt keeps your original photo and extends only its background. It is stored as optimized WebP in R2; the website image stays unchanged.</p>
    <div className="mt-2">
      <button type="button" disabled={busy} onClick={generatePrompt}
        className="rounded-full border border-[#E60023]/50 px-3 py-1.5 text-xs font-semibold text-[#B0001B] underline underline-offset-2 disabled:opacity-50">
        Generate Pinterest prompt
      </button>
      {prompt && <>
        <label className="mt-2 block text-xs font-semibold">Pinterest image prompt for {variantName}
          <textarea readOnly value={prompt} rows={5} className="mt-1 w-full resize-y rounded-xl border border-mustard/60 bg-white px-3 py-2 text-sm font-normal" />
        </label>
        <button type="button" disabled={busy} onClick={() => void copyPrompt()}
          className="mt-2 rounded-full border border-cocoa/30 px-3 py-1.5 text-xs font-semibold underline underline-offset-2 disabled:opacity-50">
          Copy Pinterest prompt
        </button>
        {promptCopied && <p role="status" className="mt-1 text-xs text-green-700">Pinterest prompt copied. Attach the variant photo when using it.</p>}
        {promptCopyError && <p role="alert" className="mt-1 text-xs text-red-700">{promptCopyError}</p>}
      </>}
    </div>
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
