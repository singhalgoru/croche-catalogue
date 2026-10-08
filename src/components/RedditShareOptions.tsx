import { useEffect, useState } from 'react';
import { getRedditShareImage } from '../utils/redditShareImage';

interface Props {
  image: string;
  title: string;
  description: string;
  url: string;
  redditUrl: string;
}

export default function RedditShareOptions({ image, title, description, url, redditUrl }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getRedditShareImage(image, title).then(photo => {
      if (cancelled) return;
      setFile(photo);
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to prepare the photo. Retry or use the Reddit link post below.');
    });
    return () => { cancelled = true; };
  }, [image, title, attempt]);

  const copy = async (text: string, message: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable. Select and copy the text below.');
      await navigator.clipboard.writeText(text);
      setFeedback(message);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Unable to copy. Select the text below.');
    }
  };
  const sharePhoto = () => {
    if (!file || !navigator.share || !navigator.canShare?.({ files: [file] })) return;
    navigator.share({ files: [file], title, text: `${title}\n${url}` }).then(() => {
      setFeedback('Choose Reddit for the photo. If its title is blank, return here and use Copy title.');
    }).catch(cause => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setFeedback(cause instanceof Error ? cause.message : 'Unable to share the photo. Download it instead.');
    });
  };
  const download = () => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    setFeedback('Photo download started. In Reddit, choose an image post, attach this photo and paste the copied title.');
  };
  const buttonClass = 'min-h-11 rounded-full border border-cocoa/30 bg-white px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-50';
  return <section aria-label="Reddit photo post" className="mt-3 space-y-3 rounded-xl border border-mustard/40 bg-white p-3">
    <h4 className="font-semibold text-cocoa">Reddit photo post</h4>
    <p className="text-xs text-cocoa/70">
      Reddit may ignore shared titles and captions. Share the photo to Reddit, then paste the title.
      If photo sharing is unavailable, download the photo and attach it to an image post.
    </p>
    <p className="select-text break-words text-sm font-semibold text-cocoa">{title}</p>
    {description.trim() && <details className="text-xs text-cocoa/70">
      <summary className="cursor-pointer font-semibold">Product description</summary>
      <p className="mt-2 select-text whitespace-pre-wrap break-words">{description}</p>
    </details>}
    <p className="select-text break-all text-xs text-cocoa/70">{url}</p>
    {!file && !error && <p role="status" className="text-xs">Preparing product photo…</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void copy(title, 'Title copied. Paste it into the Reddit title field.')} className={buttonClass}>Copy title</button>
      {description.trim() && <button type="button" onClick={() => void copy(description, 'Description copied. Paste it into the Reddit body, caption or a comment.')} className={buttonClass}>Copy description</button>}
      <button type="button" onClick={() => void copy(url, 'Product link copied. Paste it into the caption or a comment.')} className={buttonClass}>Copy product link</button>
      {file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) && <button type="button" onClick={sharePhoto} className={buttonClass}>Share photo to apps</button>}
      <button type="button" onClick={download} disabled={!file} className={buttonClass}>Download product photo</button>
      {error && <button type="button" className={buttonClass} onClick={() => {
        setError(null);
        setAttempt(current => current + 1);
      }}>Retry photo</button>}
      <a href={redditUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>Reddit link post (prefilled title)</a>
    </div>
    {feedback && <p role="status" className="text-xs font-semibold text-cocoa">{feedback}</p>}
  </section>;
}
