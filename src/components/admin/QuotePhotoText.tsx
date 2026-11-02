import { useId, useState } from 'react';
import ImageFilePicker from './ImageFilePicker';

export default function QuotePhotoText({ hasQuote, onApply, onBusyChange }: {
  hasQuote: boolean; onApply: (quote: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [replace, setReplace] = useState(false);
  const textId = useId();
  return <details className="space-y-3 rounded-xl border border-cocoa/20 p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">Extract quote from a photo</summary>
    <p className="text-xs">Read English text on this device. Your image is not sent to an AI service or added to the published photo.
      Crop to the customer message first. Check the result: handwriting, Hindi and emojis may not be recognised correctly.</p>
    <ImageFilePicker label="Review image for text extraction" file={file} onChange={event => {
      setFile(event.target.files?.[0] ?? null); setText(''); setError(''); setProgress(''); setReplace(false);
    }} />
    <button type="button" disabled={!file} className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm font-semibold disabled:opacity-50"
      onClick={async () => {
        if (!file) return;
        setError(''); setText(''); setReplace(false); setProgress('Preparing text reader...'); onBusyChange(true);
        try {
          const { extractPhotoQuote } = await import('../../services/photoQuoteOcr');
          setText(await extractPhotoQuote(file, setProgress));
          setProgress('Text extracted. Review and remove names, phone numbers, timestamps or unrelated messages before applying.');
        } catch (failure) {
          setProgress(''); setError(failure instanceof Error ? failure.message : 'Unable to extract text. Try a clearer crop.');
        } finally { onBusyChange(false); }
      }}>Extract text on this device</button>
    {progress && <p role="status" className="text-xs">{progress}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {text !== '' && <>
      <div>
        <label htmlFor={textId} className="block text-sm font-semibold">Review extracted text</label>
        <textarea id={textId} rows={5} value={text} onChange={event => setText(event.target.value)}
          className="mt-1 block w-full rounded-xl border border-cocoa/25 bg-white p-3 font-normal" />
      </div>
      {text.trim().length > 1000 && <p role="alert" className="text-xs text-red-700">Keep only the customer quote (up to 1,000 characters).</p>}
      {hasQuote && <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />
        Replace the existing quote with this reviewed text
      </label>}
      <button type="button" disabled={text.trim().length < 10 || text.trim().length > 1000 || (hasQuote && !replace)}
        className="min-h-11 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream disabled:opacity-50"
        onClick={() => { onApply(text.trim()); setProgress('Reviewed text applied to the quote. Nothing has been published.'); }}>
        Use reviewed text as quote
      </button>
    </>}
  </details>;
}
