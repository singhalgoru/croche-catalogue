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
  const captionInputs = useRef<Partial<Record<SocialPlatform, HTMLTextAreaElement>>>({});
  const product = products.find(item => item.id === productId);
  const eligible = posts.filter(post => !reviewDirty && selected.includes(post.platform) && reviewIds.includes(post.id) && (post.status === 'draft' || post.status === 'ready'));
  const imagesReady = eligible.every(post => previewReady.includes(post.request.imageUrl));
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
        facebook: value.find(post => post.platform === 'facebook')?.request.caption ?? current.facebook,
        instagram: value.find(post => post.platform === 'instagram')?.request.caption ?? current.instagram,
      }));
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
  });
  const prepare = () => run('Preparing', async () => {
    if (!product || !setup || !captionsValid || loadingPosts || postsLoadError) throw new Error('Select a product, verify publishing access and review captions first.');
    invalidate();
    const image = await prepareSocialPostJpeg(product.image);
    const value = await prepareProductSocialPosts({
      productId: product.id, sourceImageUrl: product.image, pageId: setup.pageId,
      ...(selected.includes('instagram') && setup.instagram ? { instagramUserId: setup.instagram.id } : {}),
      captions: Object.fromEntries(selected.map(platform => [platform, captions[platform]])),
    }, image);
    setPosts(value);
    setReviewDirty(false);
    setReviewIds(value.filter(post => selected.includes(post.platform) && post.status === 'draft').map(post => post.id));
    setMessage('Previews saved. No Meta post has been published. Review each saved preview below before confirming.');
  });
  const publish = () => {
    if (!confirmed || !setup?.enabled || !eligible.length || !imagesReady) return;
    const reviewed = eligible.map(post => ({ id: post.id, revision: post.revision }));
    setReviewIds([]);
    void run('Publishing', async () => {
      if (!product) throw new Error('Select a published product.');
      const value = await publishProductSocialPosts(product.id, reviewed);
      setPosts(value);
      setMessage('Review the per-platform results below. Processing is not publication. No failed or uncertain post is retried automatically.');
    });
  };

  return <AdminDialog title="Facebook / Instagram / WhatsApp product post" onClose={onClose} busy={Boolean(busy)}>
    <div className="grid gap-4 p-4 sm:p-6">
      <p className="text-sm">Create an organic product photo post, not an ad. Publishing makes it LIVE immediately; it is not paused and creates no ad budget.
        Facebook and Instagram permit one initial post per product per platform. Never use another product to bypass an uncertain result.
        WhatsApp sharing is manual; check your group before sending again to avoid duplicates.</p>
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
            <input type="checkbox" checked={selected.includes(platform)} onChange={event => {
              invalidate(); setSetup(null);
              setSelected(current => event.target.checked ? [...current, platform] : current.filter(item => item !== platform));
            }} />{labels[platform]}
          </label>)}
        </fieldset>
        {product && <div className="flex flex-wrap items-start gap-4">
          <img src={product.image} alt={`Source product photo: ${product.name}`} className="h-40 w-40 rounded-xl bg-white object-contain" />
          <p className="max-w-sm text-sm">The full photo is fitted into a 1080 x 1080 JPEG with white padding rather than cropped. Review the saved JPEG preview before publishing.
            Captions start from product details, not AI-generated claims. Meta captions are plain text; they support line breaks, emojis and hashtags but not rich-text formatting. Instagram caption links are not clickable; verify your profile&apos;s link in bio.</p>
        </div>}
        {selected.map(platform => {
          const readOnly = posts.some(post => post.platform === platform && post.status !== 'draft');
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
        <button type="button" disabled={!product || !setup || !captionsValid || loadingPosts || postsLoadError}
          onClick={() => void prepare()} className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
          {busy === 'Preparing' ? 'Preparing previews...' : 'Prepare post previews (does not publish)'}
        </button>
      </fieldset>
      {product && <WhatsAppGroupShare key={`${product.id}:${product.image}`} product={product} disabled={Boolean(busy)}
        onBusyChange={value => {
          setBusy(value ? 'WhatsApp' : '');
          setConfirmed(false);
        }} />}
      {loadingPosts && <p role="status" className="text-sm">Loading saved posting status...</p>}
      {reviewDirty && <p role="status" className="text-sm">Caption edits are not saved. Prepare new previews before publishing; checking access or refreshing status does not save edits.</p>}
      {posts.map(post => <article key={post.id} className="grid gap-2 rounded-xl border border-cocoa/25 bg-white p-3 text-sm">
        <h3 className="font-semibold">{labels[post.platform]}: {statuses[post.status]}</h3>
        <p>Product: {post.request.productName}. Page: {post.request.pageName}.
          {post.platform === 'instagram' && ` Instagram: @${post.request.instagramUsername}.`}</p>
        <img src={post.request.imageUrl} alt={`Saved ${labels[post.platform]} post preview`} className="h-56 w-56 max-w-full rounded-xl object-contain"
          onLoad={() => setPreviewReady(current => current.includes(post.request.imageUrl) ? current : [...current, post.request.imageUrl])}
          onError={() => {
            setPreviewReady(current => current.filter(url => url !== post.request.imageUrl));
            setConfirmed(false);
            setError('A saved JPEG preview could not be loaded. Restore public image access and reload the saved drafts before publishing.');
          }} />
        <p className="whitespace-pre-wrap">{post.request.caption}</p>
        <a href={post.request.productUrl} target="_blank" rel="noopener noreferrer" className="break-all underline">Review product destination</a>
        {post.error && <p className="text-red-700"><strong>Saved publishing issue:</strong> {post.error}</p>}
        {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 font-semibold underline">View published {labels[post.platform]} post</a>}
      </article>)}
      <button type="button" disabled={!product || Boolean(busy)} onClick={() => void refresh()}
        className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
        Refresh saved posting status (read-only)
      </button>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} disabled={Boolean(busy) || !eligible.length || !setup?.enabled || postsLoadError || !imagesReady}
          onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
        <span>I reviewed the saved images, captions, product claims, image rights, destinations and publishing identities for {eligible.map(post => labels[post.platform]).join(' + ') || 'the selected posts'}.
          Publish these organic posts LIVE now, not as paused ads.</span>
      </label>
      <button type="button" disabled={Boolean(busy) || !confirmed || !eligible.length || !setup?.enabled || postsLoadError || !imagesReady}
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
      Create Facebook / Instagram / WhatsApp post
    </button>
    {open && <PostComposer initialProduct={initialProduct} onClose={() => setOpen(false)} />}
  </>;
}
