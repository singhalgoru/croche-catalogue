import { useEffect, useState } from 'react';
import { generateCategoryOverview, removeSeasonalCategoryImages, saveCategoryOverview, saveSeasonalCategory, uploadSeasonalCategoryImage } from '../../services/categories';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import type { CategorySettings } from '../../types/product';
import { countOverviewWords, limitCategoryOverview } from '../../utils/categoryOverview.js';
import ImageFilePicker from './ImageFilePicker';

export default function SeasonalCategoryEditor({ category, onChanged, onClose }: {
  category: CategorySettings; onChanged: () => Promise<void>; onClose: () => void;
}) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [selected, setSelected] = useState(() => new Set(category.productIds ?? []));
  const [visible, setVisible] = useState(category.visible !== false);
  const [overview, setOverview] = useState(() => limitCategoryOverview(category.overview ?? ''));
  const [featuredTicker, setFeaturedTicker] = useState(category.featuredTicker ?? false);
  const [coverImage, setCoverImage] = useState(category.coverImage ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [pendingCleanup, setPendingCleanup] = useState<string[]>([]);
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  const [message, setMessage] = useState('');
  const generate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      setOverview(await generateCategoryOverview(category.name));
      setMessage('AI draft generated. Review and edit it, then save to publish.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to generate category overview.'); }
    finally { setBusy(false); }
  };
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const finishCleanup = async () => {
    setBusy(true); setError('');
    try {
      await removeSeasonalCategoryImages(pendingCleanup);
      setPendingCleanup([]);
      await onChanged();
      onClose();
    } catch (failure) {
      setError(`Category saved, but old cover cleanup could not finish: ${failure instanceof Error ? failure.message : 'Image cleanup failed.'} Retry cleanup before closing.`);
    } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError('');
    try {
      await removeSeasonalCategoryImages([...uploadedImages, ...pendingCleanup]);
      onClose();
    } catch (failure) {
      setError(`Unable to clean up unused cover images: ${failure instanceof Error ? failure.message : 'Image cleanup failed.'} Please retry.`);
    } finally { setBusy(false); }
  };
  useEffect(() => {
    let current = true;
    void fetchManagedProducts().then(value => { if (current) setProducts(value); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Unable to load products.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const save = async () => {
    setBusy(true); setError('');
    let categorySaved = false;
    try {
      if (category.isSeasonal) {
        let image = coverImage;
        let drafts = uploadedImages;
        if (imageFile) {
          image = await uploadSeasonalCategoryImage(imageFile);
          setCoverImage(image);
          setImageFile(null);
          setPreview('');
          drafts = [...drafts, image];
          setUploadedImages(drafts);
        }
        const previous = await saveSeasonalCategory(category.name, [...selected], visible, overview, featuredTicker, image);
        categorySaved = true;
        setUploadedImages([]);
        const obsolete = [...new Set([...drafts, previous].filter(url => url && url !== image))];
        setPendingCleanup(obsolete);
        setMessage('Seasonal category saved.');
        await removeSeasonalCategoryImages(obsolete);
        setPendingCleanup([]);
      }
      else await saveCategoryOverview(category.name, overview);
      await onChanged();
      onClose();
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to save seasonal category.';
      setError(categorySaved ? `Category saved, but cleanup or refresh could not finish: ${detail} Retry cleanup before closing.` : detail);
    } finally { setBusy(false); }
  };
  return <section aria-label={`Products in ${category.name}`} className="mt-4 rounded-xl border border-mustard/40 bg-white p-4">
    <h3 className="font-heading text-xl font-bold">{category.name} products</h3>
    {category.isSeasonal && <>
    <p className="mt-2 text-sm text-cocoa/70">Select existing products. Their original categories, prices and stock remain unchanged. A product can belong to several seasonal categories.</p>
    <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={visible} disabled={busy} onChange={event => setVisible(event.target.checked)} />
      Show this seasonal category in the shop
    </label>
    <label className="mt-3 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={featuredTicker} disabled={busy || !visible} onChange={event => setFeaturedTicker(event.target.checked)} />
      Feature this category in the clickable store ticker
    </label>
    <p className="mt-1 text-xs text-cocoa/70">Selecting this replaces the previously featured seasonal category. Hidden or empty categories are not announced.</p>
    <div className="mt-4 space-y-2">
      <ImageFilePicker label="Seasonal collection cover image" file={imageFile} disabled={busy}
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 6 * 1024 * 1024) {
            setError('Choose a JPG, PNG or WebP cover image no larger than 6 MB.');
            return;
          }
          setError('');
          setImageFile(file);
          setPreview(URL.createObjectURL(file));
        }} />
      <p className="text-xs text-cocoa/70">Use your own seasonal artwork or photo. A square image works best. The full image is shown on collection cards, not inside the category page. Save to publish; without a cover, cards use a product photo.</p>
      {(preview || coverImage) && <>
        <img src={preview || coverImage} alt={`${category.name} cover preview`}
          className="aspect-square w-48 rounded-xl bg-cream object-contain" />
        <button type="button" disabled={busy} onClick={() => { setImageFile(null); setCoverImage(''); setPreview(''); }}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2">Remove cover image</button>
      </>}
    </div>
    <label className="mt-3 block text-sm">Search products
      <input type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)}
        className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
    </label>
    {loading ? <p role="status" className="mt-3 text-sm">Loading products…</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
      {products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase())).map(product => <label
        key={product.id} className="flex items-center gap-3 rounded-lg bg-cream p-2 text-sm">
        <input type="checkbox" checked={selected.has(product.id)} disabled={busy}
          onChange={event => setSelected(current => {
            const next = new Set(current);
            if (event.target.checked) next.add(product.id); else next.delete(product.id);
            return next;
          })} />
        {product.name} · {product.category}{!product.published ? ' · Unpublished (not shown to shoppers)' : ''}
      </label>)}
      {products.length === 0 && !error && <p>No products available yet.</p>}
    </div>}
    <p className="mt-2 text-xs text-cocoa/70">{selected.size} selected. Only published products appear in the shop. Empty seasonal categories are not shown in the shop navigation.</p>
    </>}
    <label className="mt-4 block text-sm font-semibold">Category overview
      <textarea value={overview} maxLength={2000} rows={5} disabled={busy} onChange={event => setOverview(event.target.value)}
        className="mt-1 w-full rounded-xl border border-mustard/60 p-2" />
    </label>
    <p className={`mt-1 text-xs ${countOverviewWords(overview) > 90 ? 'text-red-700' : 'text-cocoa/70'}`}>{countOverviewWords(overview)} / 90 words. AI drafts use 60-90 words; shorter manual overviews are allowed.</p>
    {countOverviewWords(category.overview ?? '') > 90 && <p className="mt-1 text-xs text-cocoa/70">This older overview exceeds 90 words. The draft below has been shortened; the stored original stays unchanged until you save.</p>}
    <button type="button" disabled={busy || loading} onClick={() => { void generate(); }}
      className="mt-3 min-h-11 rounded-full border border-cocoa/30 px-4 py-2 font-semibold disabled:opacity-60">Generate overview with AI</button>
    <p className="mt-2 text-xs text-cocoa/70">Uses saved, published products only. Save product selection first, then generate. Tries Gemini, then Cloudflare Workers AI if Gemini is unavailable. Review the draft before publishing; provider usage charges may apply.</p>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {pendingCleanup.length > 0 && <button type="button" disabled={busy} onClick={() => { void finishCleanup(); }}
      className="mt-3 min-h-11 rounded-full border border-cocoa/30 px-4 py-2">Retry old cover cleanup</button>}
    <div className="mt-4 flex gap-3">
      <button type="button" disabled={busy || loading || products.length === 0 || pendingCleanup.length > 0} onClick={() => { void save(); }}
        className="min-h-11 rounded-full bg-cocoa px-4 py-2 font-semibold text-cream disabled:opacity-60">{busy ? 'Please wait…' : category.isSeasonal ? 'Save seasonal category' : 'Save category overview'}</button>
      <button type="button" disabled={busy} onClick={() => { void cancel(); }} className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2">Cancel</button>
    </div>
  </section>;
}
