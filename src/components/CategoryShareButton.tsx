import { useEffect, useState } from 'react';
import { collectionPath } from '../utils/collectionLink.js';
import { getShareableImageFile, toShareFileName } from '../utils/shareImage';
import ShareIconButton from './ShareIconButton';

export default function CategoryShareButton({ category, imageUrl = '' }: { category: string; imageUrl?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [preparedShareFile, setPreparedShareFile] = useState<File | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setPreparedShareFile(null);
      return;
    }
    let cancelled = false;
    void getShareableImageFile(imageUrl, toShareFileName(category)).then((file) => {
      if (!cancelled) setPreparedShareFile(file);
    });
    return () => {
      cancelled = true;
    };
  }, [category, imageUrl]);

  const share = async () => {
    setError(null);
    const url = new URL(collectionPath(category), window.location.origin).href;
    try {
      const file = preparedShareFile;
      const canShareImage =
        file !== null &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });
      if (canShareImage && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      if (typeof navigator.share === 'function') {
        await navigator.share(
          canShareImage
            ? {
                title: `${category} | Luvia Creations`,
                text: `Explore ${category} from Luvia Creations.`,
                url,
                files: [file],
              }
            : {
                title: `${category} | Luvia Creations`,
                text: `Explore ${category} from Luvia Creations.`,
                url,
              },
        );
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        setError('Sharing is unavailable in this browser. Open the collection and copy its address to share.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setError('Unable to share this collection. Open the collection and copy its address to share.');
    }
  };

  return <div className="flex shrink-0 flex-col items-start gap-1">
    <ShareIconButton
      productName={`${category} collection`}
      onClick={() => void share()}
      overlay={false}
      className="self-start"
    />
    {error && <p role="alert" className="max-w-xs text-sm text-red-700">{error}</p>}
  </div>;
}
