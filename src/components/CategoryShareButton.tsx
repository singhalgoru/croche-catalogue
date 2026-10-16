import { useEffect, useState } from 'react';
import { collectionPath } from '../utils/collectionLink.js';
import { getShareableImageFile, toShareFileName } from '../utils/shareImage';
import ShareIconButton from './ShareIconButton';

export default function CategoryShareButton({ category, imageUrl = '' }: { category: string; imageUrl?: string }) {
  const [error, setError] = useState<string | null>(null);
  const preparationKey = JSON.stringify([category, imageUrl]);
  const [prepared, setPrepared] = useState<{ key: string; file: File | null; error?: string } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    void getShareableImageFile(imageUrl, toShareFileName(category)).then(file => {
      if (!cancelled) setPrepared({ key: preparationKey, file });
    }).catch((failure: unknown) => {
      if (!cancelled) setPrepared({ key: preparationKey, file: null,
        error: failure instanceof Error ? failure.message : 'Unable to prepare the category share photo.' });
    });
    return () => {
      cancelled = true;
    };
  }, [category, imageUrl, preparationKey]);

  const share = async () => {
    setError(null);
    const url = new URL(collectionPath(category), window.location.origin).href;
    try {
      const current = prepared?.key === preparationKey ? prepared : null;
      const file = current?.file ?? null;
      if (imageUrl && !file) setError(current?.error
        ? `${current.error} Sharing the collection link without a photo.`
        : 'The collection photo is loading or unavailable. Sharing the collection link without a photo.');
      const text = `Explore ${category} from Luvia Creations.`;
      const canShareImage =
        file !== null &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });
      if (typeof navigator.share === 'function') {
        await navigator.share(
          canShareImage
            ? {
                title: `${category} | Luvia Creations`,
                text: `${text}\n${url}`,
                url,
                files: [file],
              }
            : {
                title: `${category} | Luvia Creations`,
                text,
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
