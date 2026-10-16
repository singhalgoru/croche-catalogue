import { useState } from 'react';
import { collectionPath } from '../utils/collectionLink.js';
import { ShareIcon } from './SocialIcons';

export default function CategoryShareButton({ category }: { category: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const share = async () => {
    setFeedback(null);
    const url = new URL(collectionPath(category), window.location.origin).href;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${category} | Luvia Creations`,
          text: `Explore ${category} from Luvia Creations.`,
          url,
        });
        setFeedback('Collection shared.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setFeedback('Collection link copied!');
      } else {
        setFeedback('Sharing is unavailable in this browser. Open the collection and copy its address to share.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setFeedback('Unable to share this collection. Open the collection and copy its address to share.');
    }
  };

  return <div className="flex shrink-0 flex-col items-start gap-1">
    <button type="button" onClick={() => void share()} aria-label={`Share ${category} collection`}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-mustard bg-white px-3 py-2 text-sm font-semibold text-cocoa hover:bg-mustard/20">
      <ShareIcon className="h-5 w-5" />
      Share category
    </button>
    {feedback && <p role="status" className="max-w-xs text-sm text-cocoa">{feedback}</p>}
  </div>;
}
