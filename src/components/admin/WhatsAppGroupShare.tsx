import { useEffect, useState } from 'react';
import type { ManagedProduct } from '../../services/products';
import { prepareSocialPostJpeg } from '../../utils/imageUploadConversion';
import { toProductPageUrl } from '../../utils/productLink';
import { toShareFileName } from '../../utils/shareImage';
import { richTextToPlainText } from '../../utils/richText';
import RichTextEditor from './RichTextEditor';

export default function WhatsAppGroupShare({ product, disabled, onBusyChange }: {
  product: ManagedProduct; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [caption, setCaption] = useState(`${product.name}\n\n${richTextToPlainText(product.description)}`);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const text = `${caption.trim()}\n\nShop: ${toProductPageUrl(product)}`;
  const canSharePhoto = Boolean(photo && typeof navigator.share === 'function' && navigator.canShare?.({ files: [photo] }));
  const blocked = disabled || busy;

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const run = async (action: () => Promise<void>) => {
    if (blocked) return;
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try { await action(); } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') {
        setMessage('Sharing cancelled. Delivery has not been verified.');
      } else {
        setError(failure instanceof Error ? failure.message : 'Unable to share. Use Copy WhatsApp caption and Download WhatsApp photo instead.');
      }
    } finally { setBusy(false); onBusyChange(false); }
  };
  const buttonClass = 'min-h-11 rounded-full border border-cocoa/30 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <section aria-label="WhatsApp group sharing" className="grid gap-3 rounded-xl border border-cocoa/25 bg-white p-3">
    <h3 className="font-semibold">WhatsApp group post (manual send)</h3>
    <p className="text-sm">No Meta access check is needed. Prepare and review the photo, then choose WhatsApp in your device&apos;s share menu,
      select your group and tap Send there. This website cannot select a group or verify delivery.
      Share only to groups where promotion is welcome.</p>
    <div className="grid gap-1 text-sm font-semibold">
      <label htmlFor="whatsapp-caption">WhatsApp caption</label>
      <RichTextEditor id="whatsapp-caption" label="WhatsApp caption" rows={5} value={caption}
        disabled={blocked} format="whatsapp" emojiLabel="Add emoji to WhatsApp caption" onChange={value => {
          setCaption(value); setMessage(''); setError('');
        }} />
    </div>
    <p className="select-text break-all text-sm">Shop: {toProductPageUrl(product)}</p>
    <button type="button" disabled={blocked || Boolean(photo)} className={buttonClass} onClick={() => void run(async () => {
      const jpeg = await prepareSocialPostJpeg(product.image);
      const file = new File([jpeg], `${toShareFileName(product.name)}.jpg`, { type: 'image/jpeg' });
      setPreviewUrl(URL.createObjectURL(file));
      setPhoto(file);
      setMessage('WhatsApp photo prepared locally. Nothing has been sent. Review the photo and caption before sharing.');
    })}>{busy && !photo ? 'Preparing WhatsApp photo...' : 'Prepare WhatsApp photo (does not send)'}</button>
    {previewUrl && <img src={previewUrl} alt="WhatsApp product photo preview" className="h-56 w-56 max-w-full rounded-xl object-contain"
      onLoad={() => setPhotoReady(true)} onError={() => {
        setPhotoReady(false);
        setError('The WhatsApp photo preview could not load. Download and inspect the photo before sending it manually.');
      }} />}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={blocked || !canSharePhoto || !photoReady || !caption.trim()} className={buttonClass} onClick={() => void run(async () => {
        if (!photo) throw new Error('Prepare and review the WhatsApp photo first.');
        await navigator.share({ files: [photo], title: product.name, text });
        setMessage('Share menu closed. Check WhatsApp to confirm the group and delivery; this website cannot verify that a message was sent.');
      })}>Share photo to WhatsApp group</button>
      <button type="button" disabled={blocked || !caption.trim()} className={buttonClass} onClick={() => void run(async () => {
        if (!navigator.clipboard) throw new Error('Clipboard is unavailable. Select and copy the caption and product link manually.');
        await navigator.clipboard.writeText(text);
        setMessage('Caption and product link copied. Paste them into WhatsApp and review before sending.');
      })}>Copy WhatsApp caption</button>
      <a href={previewUrl || undefined} download={photo?.name} aria-disabled={!previewUrl || blocked}
        onClick={event => {
          if (!previewUrl || blocked) event.preventDefault();
          else setMessage('Photo download requested. Attach it in WhatsApp, paste the copied caption and review before tapping Send.');
        }} className={`${buttonClass} ${!previewUrl || blocked ? 'opacity-50' : ''}`}>Download WhatsApp photo</a>
      {caption.trim() && !blocked && <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
        className={buttonClass}>Open WhatsApp with text only</a>}
    </div>
    {!canSharePhoto && <p className="text-sm">If photo sharing is unavailable, prepare and download the photo, copy the caption, then attach and send them in WhatsApp.</p>}
    <p className="text-sm">Some apps omit shared captions. Use Copy WhatsApp caption if needed. WhatsApp captions and photos are not saved when this modal closes.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
