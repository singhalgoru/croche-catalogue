import { useEffect, useState } from 'react';
import { collectionPath } from '../utils/collectionLink.js';
import { toShareFileName } from '../utils/shareImage';
import { getCategoryShareImageFile } from '../utils/categoryShareImage';
import type { CategoryHotspot } from '../types/product';
import ShareIconButton from './ShareIconButton';

const NO_HOTSPOTS: CategoryHotspot[] = [];
export default function CategoryShareButton({ category, imageUrl = '', hotspots = NO_HOTSPOTS }: { category: string; imageUrl?: string; hotspots?: CategoryHotspot[] }) {
  const [error, setError] = useState<string | null>(null);
  const preparationKey = JSON.stringify([category, imageUrl, hotspots.map(({ productId, x, y }) => ({ productId, x, y }))]);
  const [prepared, setPrepared] = useState<{ key: string; file: File | null; error?: string } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    void getCategoryShareImageFile(imageUrl, toShareFileName(category), hotspots).then(file => {
      if (!cancelled) setPrepared({ key: preparationKey, file });
    }).catch((failure: unknown) => {
      if (!cancelled) setPrepared({ key: preparationKey, file: null,
        error: failure instanceof Error ? failure.message : 'Unable to prepare the category share photo.' });
    });
    return () => {
      cancelled = true;
    };
  }, [category, imageUrl, hotspots, preparationKey]);

  const share = async () => {
    setError(null);
    const url = new URL(collectionPath(category), window.location.origin).href;
    try {
      const current = prepared?.key === preparationKey ? prepared : null;
      const file = current?.file ?? null;
      if (imageUrl && !file) setError(current?.error
        ? `${current.error} Sharing the collection link without a photo.`
        : 'The collection photo is loading or unavailable. Sharing the collection link without a photo.');
      const text = `Explore ${category} from Luvia Creations.${hotspots.length ? ' Open the collection link to tap the small rings and explore the products.' : ''}`;
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
