import { useEffect, useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import { fetchManagedProducts, type ManagedProduct } from '../../services/products';
import {
  checkSocialPublishing, listProductSocialPosts, prepareProductSocialPosts, publishProductSocialPosts,
  refreshProductSocialPosts, socialCaptionLimits, type SocialPlatform, type SocialPost, type SocialPublishingSetup,
} from '../../services/socialPosts';
import { prepareSocialPostJpeg } from '../../utils/imageUploadConversion';
import { toProductPageUrl } from '../../utils/productLink';
import WhatsAppGroupShare from './WhatsAppGroupShare';
import PinterestShare from './PinterestShare';
import { richTextToPlainText } from '../../utils/richText';
import EmojiPicker from './EmojiPicker';

const platforms: SocialPlatform[] = ['facebook', 'instagram'];
const labels = { facebook: 'Facebook Page', instagram: 'Instagram' };
const statuses = {
  draft: 'Draft - not published', publishing: 'Publishing result needs verification',
  processing: 'Instagram is processing the image', ready: 'Instagram image ready - confirm to publish',
  published: 'Published', needs_attention: 'Needs operator attention - do not retry',
};
const starterCaptions = (product: ManagedProduct) => ({
  facebook: `${product.name}\n\n${richTextToPlainText(product.description)}\n\nShop: ${toProductPageUrl(product)}`,
  instagram: `${product.name}\n\n${richTextToPlainText(product.description)}\n\nShop via the link in our bio.\n\n#LuviaCreations #HandmadeCrochet`,
});

const productPhotos = (product: ManagedProduct) => [...new Set([
  product.image,
  ...product.variants.flatMap(variant => [variant.image, ...variant.gallery.map(image => image.image)]),
].filter(Boolean))];
const savedPhotos = (post: SocialPost) => post.request.imageUrls ?? [post.request.imageUrl];
const isVideoPost = (post: SocialPost) => post.request.mediaType === 'video';
const hasVideo = (post: SocialPost) => isVideoPost(post) || post.request.mediaType === 'mixed';

function PostComposer({ initialProduct, onClose }: { initialProduct?: ManagedProduct; onClose: () => void }) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [productId, setProductId] = useState(initialProduct?.id ?? '');
  const [selected, setSelected] = useState<SocialPlatform[]>(['facebook', 'instagram']);
  const [captions, setCaptions] = useState(initialProduct ? starterCaptions(initialProduct) : { facebook: '', instagram: '' });
  const [setup, setSetup] = useState<SocialPublishingSetup | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(Boolean(initialProduct));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [postsLoadError, setPostsLoadError] = useState(false);
  const [previewReady, setPreviewReady] = useState<string[]>([]);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>(initialProduct ? [initialProduct.image] : []);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'mixed'>('image');
  const [replacesPostIds, setReplacesPostIds] = useState<Partial<Record<SocialPlatform, string>>>({});
  const captionInputs = useRef<Partial<Record<SocialPlatform, HTMLTextAreaElement>>>({});
  const product = products.find(item => item.id === productId);
  const eligible = posts.filter(post => !reviewDirty && selected.includes(post.platform) && reviewIds.includes(post.id)
    && (post.request.mediaType ?? 'image') === mediaType && (post.status === 'draft' || post.status === 'ready'));
  const previewsReady = eligible.every(post =>
    (!hasVideo(post) || Boolean(post.request.videoUrl && previewReady.includes(post.request.videoUrl)))
    && (isVideoPost(post) || savedPhotos(post).every(url => previewReady.includes(url))));
  const maxPhotos = mediaType === 'mixed' ? 9 : 10;
  const replacementInput = Object.fromEntries(selected.filter(platform => replacesPostIds[platform])
    .map(platform => [platform, replacesPostIds[platform]!]));
  const captionsValid = selected.length > 0 && selected.every(platform =>
    captions[platform].trim() && captions[platform].length <= socialCaptionLimits[platform]);
  const invalidate = () => { setReviewIds([]); setConfirmed(false); setMessage(''); };
  const insertCaptionEmoji = (platform: SocialPlatform, emoji: string) => {
    const input = captionInputs.current[platform];
    if (!input || input.readOnly) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const caption = `${captions[platform].slice(0, start)}${emoji}${captions[platform].slice(end)}`;
    if (caption.length > socialCaptionLimits[platform]) {
      setError(`${labels[platform]} caption must stay within ${socialCaptionLimits[platform].toLocaleString()} characters.`);
      return;
    }
    invalidate();
    setReviewDirty(true);
    setCaptions(current => ({ ...current, [platform]: caption }));
    requestAnimationFrame(() => {
      if (!input.isConnected) return;
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  useEffect(() => {
    let active = true;
    void fetchManagedProducts().then(value => {
      if (active) setProducts(value.filter(item => item.published && item.image));
    }).catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load products for social posting.');
    }).finally(() => { if (active) setLoadingProducts(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!productId) return;
    let active = true;
    void listProductSocialPosts(productId).then(value => {
      if (!active) return;
      setPosts(value);
      setCaptions(current => ({
        facebook: value.find(post => post.platform === 'facebook' && post.status !== 'published')?.request.caption ?? current.facebook,
        instagram: value.find(post => post.platform === 'instagram' && post.status !== 'published')?.request.caption ?? current.instagram,
      }));
      const activePost = value.find(post => post.status === 'draft' || post.status === 'ready' || post.status === 'processing');
      if (activePost) {
        setMediaType(activePost.request.mediaType ?? 'image');
        setSelectedImages(activePost.request.sourceImageUrls ?? [activePost.request.sourceImageUrl]);
        if (activePost.request.mediaType === 'mixed') setSelected(['instagram']);
      }
      setReplacesPostIds(Object.fromEntries(value.filter(post => post.status !== 'published' && post.request.replacesPostId)
        .map(post => [post.platform, post.request.replacesPostId!])));
      setReviewIds(value.filter(post => post.status === 'draft' || post.status === 'ready').map(post => post.id));
      setPostsLoadError(false);
    }).catch(failure => {
      if (!active) return;
      setPostsLoadError(true);
      setError(failure instanceof Error ? failure.message : 'Unable to load existing social posts. Do not publish until status is known.');
    }).finally(() => { if (active) setLoadingPosts(false); });
    return () => { active = false; };
  }, [productId, loadAttempt]);

  const selectProduct = (id: string) => {
    invalidate();
    setError('');
    setReviewDirty(false);
    setPosts([]);
    setPostsLoadError(false);
    setLoadingPosts(Boolean(id));
    setProductId(id);
    const item = products.find(value => value.id === id);
    setSelectedImages(item ? [item.image] : []);
    setMediaType('image');
    setReplacesPostIds({});
    setCaptions(item ? starterCaptions(item) : { facebook: '', instagram: '' });
  };
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setError('');
    setMessage('');
    setConfirmed(false);
    try { await action(); } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The social publishing request could not be completed. Refresh saved status.');
    } finally { setBusy(''); }
  };
  const refresh = () => run('Refreshing', async () => {
    if (!product) throw new Error('Select a published product.');
    const value = await refreshProductSocialPosts(product.id);
    setPosts(value);
    setPostsLoadError(false);
    setReviewIds(value.filter(post => post.status === 'draft' || post.status === 'ready').map(post => post.id));
    const processingPost = value.find(post => post.status === 'processing');
    if (processingPost) {
      setMessage(`${labels[processingPost.platform]} is still processing the saved ${hasVideo(processingPost) ? 'video' : 'post'}. Wait a little, then check the status again. Nothing new was published.`);
    } else if (value.some(post => post.platform === 'instagram' && post.status === 'ready')) {
      setMessage('Instagram processing is complete. Review the saved preview, check publishing access and confirm before publishing.');
    } else {
      setMessage('Saved posting status refreshed. Review the results below.');
    }
  });
  const prepare = () => run('Preparing', async () => {
    if (!product || !setup || !captionsValid || loadingPosts || postsLoadError) throw new Error('Select a product, verify publishing access and review captions first.');
    invalidate();
    if (mediaType === 'video') {
      if (!product.makingVideo) throw new Error('This product has no published making video. Refresh product media before preparing a video post.');
      if (selected.includes('instagram') && product.makingVideo.durationSeconds < 3) {
        throw new Error('Instagram Reels require a video of at least 3 seconds. Choose a longer making video or post to Facebook only.');
      }
      const value = await prepareProductSocialPosts({
        productId: product.id, sourceImageUrl: product.image, pageId: setup.pageId,
        mediaType: 'video', videoUrl: product.makingVideo.videoUrl,
        ...(selected.includes('instagram') && setup.instagram ? { instagramUserId: setup.instagram.id } : {}),
        captions: Object.fromEntries(selected.map(platform => [platform, captions[platform]])),
        ...(Object.keys(replacementInput).length ? { replacesPostIds: replacementInput } : {}),
      });
      setPosts(value);
      setReviewDirty(false);
      setReviewIds(value.filter(post => selected.includes(post.platform) && post.status === 'draft').map(post => post.id));
      setMessage('Video post previews saved. Nothing has been published. Review the saved video before confirming.');
      return;
    }
    if (!selectedImages.length || selectedImages.length > maxPhotos) throw new Error(`Select between 1 and ${maxPhotos} product photos.`);
    if (mediaType === 'mixed' && (!product.makingVideo || product.makingVideo.durationSeconds < 3
      || selected.length !== 1 || selected[0] !== 'instagram')) {
      throw new Error('Photos + video requires Instagram only and a published making video of at least 3 seconds.');
    }
    const images: File[] = [];
    for (const source of selectedImages) images.push(await prepareSocialPostJpeg(source));
    const value = await prepareProductSocialPosts({
      productId: product.id, sourceImageUrl: selectedImages[0], sourceImageUrls: selectedImages, pageId: setup.pageId,
      ...(selected.includes('instagram') && setup.instagram ? { instagramUserId: setup.instagram.id } : {}),
      captions: Object.fromEntries(selected.map(platform => [platform, captions[platform]])),
      ...(mediaType === 'mixed' && product.makingVideo ? { mediaType: 'mixed', videoUrl: product.makingVideo.videoUrl } : {}),
      ...(Object.keys(replacementInput).length ? { replacesPostIds: replacementInput } : {}),
    }, images);
    setPosts(value);
    setReviewDirty(false);
    setReviewIds(value.filter(post => selected.includes(post.platform) && post.status === 'draft').map(post => post.id));
    setMessage('Previews saved. No Meta post has been published. Review each saved preview below before confirming.');
  });
  const publish = () => {
    if (!confirmed || !setup?.enabled || !eligible.length || !previewsReady) return;
    const reviewed = eligible.map(post => ({ id: post.id, revision: post.revision }));
    setReviewIds([]);
    void run('Publishing', async () => {
      if (!product) throw new Error('Select a published product.');
      const value = await publishProductSocialPosts(product.id, reviewed);
      setPosts(value);
      setMessage('Review the per-platform results below. Processing is not publication. No failed or uncertain post is retried automatically.');
    });
  };

  return <AdminDialog title="Product social post" onClose={onClose} busy={Boolean(busy)}>
    <div className="grid gap-4 p-4 sm:p-6">
      <p className="text-sm">Create an organic Facebook/Instagram product photo or video post, not an ad. Publishing there makes it LIVE immediately; it is not paused and creates no ad budget.
        New Meta posts keep previously published posts unchanged. Only one unfinished Meta post per product and platform is allowed; resolve uncertain results before starting another.
        Pinterest preparation and WhatsApp sharing are manual and do not use the Meta LIVE button.
        Check the destination app before posting again to avoid duplicates.</p>
      {posts.some(post => post.status === 'published') && <p className="rounded-xl border border-mustard/40 bg-cream/60 p-3 text-sm">
        This product already has published posts. Prepare previews to create a separate new post, or choose Replace below to link a replacement draft.
        Published posts are never edited or deleted automatically.
      </p>}
      {Object.keys(replacementInput).length > 0 && <div role="status" className="rounded-xl border border-mustard/40 bg-cream/60 p-3 text-sm">
        Replacement draft for {Object.keys(replacementInput).map(platform => labels[platform as SocialPlatform]).join(' + ')}.
        Publishing creates a new post and link; likes and comments do not transfer. After success, open the original post below and remove it manually in Meta.
        <button type="button" disabled={Boolean(busy)} className="ml-2 min-h-11 underline" onClick={() => {
          invalidate(); setReviewDirty(true); setReplacesPostIds({});
        }}>Make this a separate new post instead</button>
      </div>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <fieldset disabled={Boolean(busy) || loadingProducts || loadingPosts} className="grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Published product
          <select value={productId} onChange={event => selectProduct(event.target.value)} className="min-h-11 rounded-xl border border-cocoa/25 bg-white px-3">
            <option value="">{loadingProducts ? 'Loading products...' : 'Select a published product'}</option>
            {products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-semibold">Post to</legend>
          {platforms.map(platform => <label key={platform} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(platform)}
              disabled={(platform === 'facebook' && mediaType === 'mixed')
                || (platform === 'instagram' && mediaType !== 'image' && Boolean(product?.makingVideo && product.makingVideo.durationSeconds < 3))}
              onChange={event => {
              invalidate(); setSetup(null);
              setSelected(current => event.target.checked ? [...current, platform] : current.filter(item => item !== platform));
            }} />{labels[platform]}
          </label>)}
        </fieldset>
        {product && <div className="flex flex-wrap items-start gap-4">
          <img src={product.image} alt={`Source product photo: ${product.name}`} className="h-40 w-40 rounded-xl bg-white object-contain" />
          <p className="max-w-sm text-sm">{mediaType !== 'image'
            ? 'The published making video is sent to Meta from its public video URL. Review the saved video and poster before publishing.'
            : 'The full photo is fitted into a 1080 x 1080 JPEG with white padding rather than cropped. Review the saved JPEG preview before publishing.'}
            Captions start from product details, not AI-generated claims. Meta captions are plain text; they support line breaks, emojis and hashtags but not rich-text formatting. Instagram caption links are not clickable; verify your profile&apos;s link in bio.</p>
        </div>}
        {product?.makingVideo && <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Post media</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="post-media-type" value="image" checked={mediaType === 'image'}
              onChange={() => { invalidate(); setReviewDirty(true); setMediaType('image'); }} />
            Product photos
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="post-media-type" value="video" checked={mediaType === 'video'}
              onChange={() => {
                invalidate();
                setReviewDirty(true);
                setMediaType('video');
                if (product.makingVideo && product.makingVideo.durationSeconds < 3) {
                  setSelected(current => current.filter(platform => platform !== 'instagram'));
                }
              }} />
            Making video ({product.makingVideo.durationSeconds}s)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="post-media-type" value="mixed" checked={mediaType === 'mixed'}
              disabled={product.makingVideo.durationSeconds < 3}
              onChange={() => {
                invalidate(); setReviewDirty(true); setMediaType('mixed'); setSelected(['instagram']); setSetup(null);
              }} />
            Photos + making video (one Instagram carousel)
          </label>
          <p className="text-sm">Instagram can combine up to nine selected photos followed by the making video in one swipeable post.
            The first photo is the cover; Instagram may crop the video to match it. Mixed posts are Instagram-only here.
            Choose photos or video separately for Facebook.</p>
          {mediaType !== 'image' && product.makingVideo.durationSeconds < 3 && <p className="text-sm">
            This video is too short for Instagram Reels. You can select Facebook only, or choose product photos for both platforms.
          </p>}
        </fieldset>}
        {product && mediaType !== 'image' && product.makingVideo && <div className="grid gap-2">
          <video src={product.makingVideo.videoUrl} poster={product.makingVideo.posterUrl} controls playsInline
            preload="metadata" className="max-h-96 max-w-full rounded-xl bg-black" aria-label={`${product.name} making video`} />
          <p className="text-sm">{product.makingVideo.title || `Making ${product.name}`} · {product.makingVideo.durationSeconds}s</p>
        </div>}
        {product && mediaType !== 'video' && <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">Post photos ({selectedImages.length}/{maxPhotos})</legend>
          <p className="text-sm">Select up to {maxPhotos} photos. The first is the cover. {mediaType === 'mixed'
            ? 'The making video is the last item in the same Instagram carousel.'
            : 'Multiple photos create an Instagram carousel and a Facebook multi-photo post.'} WhatsApp sharing stays separate.</p>
          <button type="button" className="min-h-11 justify-self-start underline" onClick={() => {
            const photos = productPhotos(product);
            if (photos.length > maxPhotos) {
              setError(`This product has more than ${maxPhotos} photos. Select up to ${maxPhotos} individually.`);
              return;
            }
            invalidate(); setReviewDirty(true); setSelectedImages(photos);
          }}>Select all product photos</button>
          <div className="flex flex-wrap gap-3">
            {productPhotos(product).map((url, index) => <label key={url} className="grid gap-1 text-sm">
              <img src={url} alt={`Available product photo ${index + 1}`} className="h-24 w-24 rounded-lg object-contain" />
              <span><input type="checkbox" checked={selectedImages.includes(url)}
                disabled={!selectedImages.includes(url) && selectedImages.length >= maxPhotos}
                onChange={event => {
                  invalidate(); setReviewDirty(true);
                  setSelectedImages(current => event.target.checked ? [...current, url] : current.filter(image => image !== url));
                }} /> Photo {index + 1}</span>
            </label>)}
          </div>
          <ol className="grid gap-2">
            {selectedImages.map((url, index) => <li key={url} className="flex flex-wrap items-center gap-3 text-sm">
              <img src={url} alt={`Selected photo ${index + 1}`} className="h-12 w-12 object-contain" />
              <span>{index + 1}{index === 0 ? ' - Cover' : ''}</span>
              <button type="button" disabled={index === 0} className="min-h-11 underline disabled:opacity-40"
                aria-label={`Move photo ${index + 1} earlier`} onClick={() => {
                  invalidate(); setReviewDirty(true);
                  setSelectedImages(current => {
                    const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;
                  });
                }}>Earlier</button>
              <button type="button" disabled={index === selectedImages.length - 1} className="min-h-11 underline disabled:opacity-40"
                aria-label={`Move photo ${index + 1} later`} onClick={() => {
                  invalidate(); setReviewDirty(true);
                  setSelectedImages(current => {
                    const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next;
                  });
                }}>Later</button>
            </li>)}
          </ol>
        </fieldset>}
        {selected.map(platform => {
          const readOnly = posts.some(post => post.platform === platform && post.status !== 'draft' && post.status !== 'published');
          return <div key={platform} className="grid gap-1 text-sm font-semibold">
            <label htmlFor={`caption-${platform}`}>{labels[platform]} caption</label>
            <EmojiPicker label={`Add emoji to ${labels[platform]} caption`} disabled={readOnly}
              onSelect={emoji => insertCaptionEmoji(platform, emoji)} />
            <textarea id={`caption-${platform}`} ref={input => { captionInputs.current[platform] = input ?? undefined; }}
              rows={5} value={captions[platform]} readOnly={readOnly} onChange={event => {
                invalidate(); setReviewDirty(true); setCaptions(current => ({ ...current, [platform]: event.target.value }));
              }} className="rounded-xl border border-cocoa/25 p-3 font-normal" />
            <span className={captions[platform].length > socialCaptionLimits[platform] ? 'text-red-700' : 'font-normal'}>
              {captions[platform].length}/{socialCaptionLimits[platform]} characters
            </span>
          </div>;
        })}
        <button type="button" disabled={!selected.length} onClick={() => void run('Checking', async () => {
          setConfirmed(false); setSetup(null);
          setSetup(await checkSocialPublishing(selected));
          setReviewIds(posts.filter(post => selected.includes(post.platform) && (post.status === 'draft' || post.status === 'ready')).map(post => post.id));
        })} className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold">
          {busy === 'Checking' ? 'Checking publishing access...' : 'Check publishing access (read-only)'}
        </button>
        {setup && <p className="text-sm">Verified Page: <strong>{setup.pageName}</strong> ({setup.pageId}).
          {setup.instagram && <> Instagram: <strong>@{setup.instagram.username}</strong> ({setup.instagram.id}).</>}
          {!setup.enabled && <> Publishing is disabled until the operator enables it after permission and preview verification. Draft preparation is still available.</>}
        </p>}
        <button type="button" disabled={!product || !setup || !captionsValid || (mediaType !== 'video' && !selectedImages.length)
          || (mediaType !== 'image' && !product.makingVideo) || (mediaType !== 'video' && selectedImages.length > maxPhotos)
          || loadingPosts || postsLoadError}
          onClick={() => void prepare()} className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
          {busy === 'Preparing' ? 'Preparing previews...' : 'Prepare post previews (does not publish)'}
        </button>
      </fieldset>
      {product && <WhatsAppGroupShare key={`${product.id}:${product.image}`} product={product} disabled={Boolean(busy)}
        onBusyChange={value => {
          setBusy(value ? 'WhatsApp' : '');
          setConfirmed(false);
        }} />}
      {product && <PinterestShare key={`pinterest:${product.id}:${product.image}:${product.name}`} product={product}
        disabled={Boolean(busy)} onBusyChange={value => {
          setBusy(value ? 'Pinterest' : '');
          setConfirmed(false);
        }} />}
      {loadingPosts && <p role="status" className="text-sm">Loading saved posting status...</p>}
      {reviewDirty && <p role="status" className="text-sm">Photo, video or caption edits are not saved. Prepare new previews before publishing; checking access or refreshing status does not save edits.</p>}
      {posts.map(post => {
        const original = posts.find(item => item.id === post.request.replacesPostId);
        return <article key={post.id} className="grid gap-2 rounded-xl border border-cocoa/25 bg-white p-3 text-sm">
        <h3 className="font-semibold">{labels[post.platform]}: {post.status === 'processing' && hasVideo(post)
          ? `${labels[post.platform]} is processing the video` : post.status === 'ready' && hasVideo(post)
            ? 'Instagram media ready - confirm to continue publishing' : statuses[post.status]}</h3>
        {post.status === 'processing' && <div className="rounded-xl border border-mustard/40 bg-cream/60 p-3">
          <p>{post.platform === 'instagram'
            ? 'Instagram has not finished processing this saved post.'
            : 'Facebook has not finished processing this saved video.'} Check its status again after a short wait.
            Checking does not publish or create another post.</p>
          <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()}
            className="mt-2 min-h-11 rounded-full border border-cocoa/30 bg-white px-4 font-semibold disabled:opacity-50">
            {busy === 'Refreshing' ? 'Checking post status...' : `Check ${labels[post.platform]} status`}
          </button>
        </div>}
        <p>Product: {post.request.productName}. Page: {post.request.pageName}.
          {post.platform === 'instagram' && ` Instagram: @${post.request.instagramUsername}.`}</p>
        {post.request.mediaType === 'mixed' && <p>One Instagram carousel: {savedPhotos(post).length} photo(s), then one making video. First photo is the cover.</p>}
        {!isVideoPost(post) && <ol aria-label={`${labels[post.platform]} saved photos`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedPhotos(post).map((url, index) => <li key={url} className="min-w-0">
              <img src={url}
                alt={`Saved ${labels[post.platform]} post preview${savedPhotos(post).length > 1 ? ` ${index + 1}` : ''}`}
                className="aspect-square w-full max-w-56 rounded-xl bg-cream/40 object-contain"
                onLoad={() => setPreviewReady(current => current.includes(url) ? current : [...current, url])}
                onError={() => {
                  setPreviewReady(current => current.filter(image => image !== url));
                  setConfirmed(false);
                  setError('A saved JPEG preview could not be loaded. Restore public image access and reload the saved drafts before publishing.');
                }} />
              {savedPhotos(post).length > 1 && <p className="mt-1 text-xs text-cocoa/70">
                Photo {index + 1}{index === 0 ? ' - Cover' : ''}
              </p>}
            </li>)}
          </ol>}
        {hasVideo(post) && post.request.videoUrl && <video src={post.request.videoUrl} poster={post.request.videoPosterUrl ?? post.request.imageUrl} controls playsInline preload="metadata"
            aria-label={`Saved ${labels[post.platform]} video preview`}
            onLoadedData={() => setPreviewReady(current => current.includes(post.request.videoUrl!)
              ? current : [...current, post.request.videoUrl!])}
            onError={() => {
              setPreviewReady(current => current.filter(url => url !== post.request.videoUrl));
              setConfirmed(false);
              setError('The saved video preview could not be loaded. Restore public video access and reload the saved draft before publishing.');
            }}
            className="max-h-96 max-w-full rounded-xl bg-black" />}
        <p className="whitespace-pre-wrap">{post.request.caption}</p>
        <a href={post.request.productUrl} target="_blank" rel="noopener noreferrer" className="break-all underline">Review product destination</a>
        {post.error && <p className="text-red-700"><strong>Saved publishing issue:</strong> {post.error}</p>}
        {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 font-semibold underline">View published {labels[post.platform]} post</a>}
        {post.request.replacesPostId && <p className="rounded-lg bg-cream/60 p-3">
          {post.status === 'published' ? 'Replacement published. The original is still live; remove it manually only after checking this replacement.' : 'This is a replacement draft. The original post remains unchanged.'}
          {original?.permalink && <a
            href={original.permalink}
            target="_blank" rel="noopener noreferrer" className="ml-2 min-h-11 inline-block py-2 underline">Open original post</a>}
        </p>}
        {post.status === 'published' && <button type="button"
          disabled={Boolean(busy) || posts.some(other => other.platform === post.platform && other.status !== 'draft' && other.status !== 'published')}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50"
          onClick={() => {
            invalidate(); setReviewDirty(true); setSetup(null);
            setSelected([post.platform]); setReplacesPostIds({ [post.platform]: post.id });
            setCaptions(current => ({ ...current, [post.platform]: post.request.caption }));
            setMediaType('image'); setSelectedImages(product ? [product.image] : []);
            setMessage('Replacement started. Choose photos, video or an Instagram mixed carousel above, check access, then prepare and review new previews. The original stays live.');
            requestAnimationFrame(() => captionInputs.current[post.platform]?.focus());
          }}>Replace this {labels[post.platform]} post</button>}
      </article>;
      })}
      <button type="button" disabled={!product || Boolean(busy)} onClick={() => void refresh()}
        className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
        Refresh saved posting status (read-only)
      </button>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} disabled={Boolean(busy) || !eligible.length || !setup?.enabled || postsLoadError || !previewsReady}
          onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
        <span>I reviewed the saved images or videos, captions, product claims, media rights, destinations and publishing identities for {eligible.map(post => labels[post.platform]).join(' + ') || 'the selected posts'}.
          Publish these organic posts LIVE now, not as paused ads.</span>
      </label>
      <button type="button" disabled={Boolean(busy) || !confirmed || !eligible.length || !setup?.enabled || postsLoadError || !previewsReady}
        onClick={publish} className="min-h-11 rounded-full bg-cocoa px-4 font-semibold text-cream disabled:opacity-50">
        {busy === 'Publishing' ? 'Publishing live posts...' : 'Confirm and publish LIVE'}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => {
        setLoadingProducts(true); setLoadingPosts(Boolean(productId)); setLoadAttempt(value => value + 1);
        invalidate(); setReviewDirty(false); setSetup(null); setError('');
      }} className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm">
        Reload products and saved drafts
      </button>
    </div>
  </AdminDialog>;
}

export default function MarketingSocialPosts({ initialProduct, disabled = false }: { initialProduct?: ManagedProduct; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} disabled={disabled}
      className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa">
      Create social post
    </button>
    {open && <PostComposer initialProduct={initialProduct} onClose={() => setOpen(false)} />}
  </>;
}
