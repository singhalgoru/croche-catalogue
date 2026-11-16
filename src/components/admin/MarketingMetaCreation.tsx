import { useEffect, useState, type FormEvent } from 'react';
import { formatMetaCreationError } from '../../../supabase/functions/_shared/metaErrors';
import type { Product } from '../../types/product';
import {
  createPausedMetaCampaign, fetchMetaCampaignCreation, fetchMetaCreationSetup,
  recoverPausedMetaCampaign, reviewMetaCampaignRecovery,
  type MetaRecoveryReview,
  type MarketingLocation, type MetaCampaignCreation, type MetaCreationSetup, type SavedMarketingCampaignDraft,
} from '../../services/marketing';
import MarketingLocationPicker from './MarketingLocationPicker';

const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value);
const defaultStart = () => {
  const date = new Date(Date.now() + 3600_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function MarketingMetaCreation({ draft, products }: {
  draft: SavedMarketingCampaignDraft;
  products: Product[];
}) {
  const [setup, setSetup] = useState<MetaCreationSetup | null>(null);
  const [creation, setCreation] = useState<MetaCampaignCreation | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [productId, setProductId] = useState('');
  const [primaryTextIndex, setPrimaryTextIndex] = useState(0);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [startTime, setStartTime] = useState(defaultStart);
  const countryDefault = draft.proposal.targetLocation === 'India';
  const [locationLabel, setLocationLabel] = useState(countryDefault ? 'India' : '');
  const [locations, setLocations] = useState<MarketingLocation[] | null>(countryDefault ? null : []);
  const [confirmed, setConfirmed] = useState(false);
  const [recoveryReview, setRecoveryReview] = useState<MetaRecoveryReview | null>(null);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [placement, setPlacement] = useState<'facebook-feed' | 'instagram-feed'>('facebook-feed');
  const [instagram, setInstagram] = useState<MetaCreationSetup['instagram']>();
  const [checkingInstagram, setCheckingInstagram] = useState(false);
  const instagramReady = placement !== 'instagram-feed' || Boolean(instagram);
  const p = draft.proposal;
  const product = products.find(item => item.id === productId);
  const supported = p.callToAction !== 'Send message' && (p.goal !== 'sales' || Boolean(setup?.pixelId));
  const startMillis = Date.parse(startTime);
  const endLabel = Number.isFinite(startMillis)
    ? new Date(startMillis + p.durationDays * 86400_000).toLocaleString('en-IN') : 'Choose a valid start time';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await fetchMetaCampaignCreation(draft.id);
        if (!active) return;
        setCreation(existing);
        setUncertain(false);
        if (!existing) {
          const value = await fetchMetaCreationSetup();
          if (active) setSetup(value);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load Meta creation setup.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [draft.id, attempt]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || creation) return;
    if (!confirmed || !setup || !product || !locationLabel || !supported || !instagramReady || !Number.isFinite(Date.parse(startTime))) {
      setError('Review the image, supported goal, locations and start time, then confirm paused creation.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setCreation(await createPausedMetaCampaign({
        draftId: draft.id, productId, primaryTextIndex, headlineIndex,
        startTime: new Date(startTime).toISOString(), locations,
        ...(placement === 'instagram-feed' && instagram ? { placement, instagramUserId: instagram.id } : {}),
      }));
    } catch (failure) {
      setUncertain(true);
      setError(failure instanceof Error ? failure.message : 'Creation could not be confirmed. Refresh status before retrying.');
    } finally {
      setBusy(false);
    }
  };

  const checkInstagram = async () => {
    if (busy) return;
    setBusy(true);
    setCheckingInstagram(true);
    setError('');
    setConfirmed(false);
    setInstagram(undefined);
    try {
      const value = await fetchMetaCreationSetup('instagram-feed');
      if (!value.instagram || (setup && (value.accountId !== setup.accountId || value.pageId !== setup.pageId))
        || (creation && value.accountId !== creation.account_id)) {
        throw new Error('Instagram setup changed or is incomplete. Refresh setup before creating anything.');
      }
      setInstagram(value.instagram);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to verify the Instagram connection.');
    } finally {
      setCheckingInstagram(false);
      setBusy(false);
    }
  };

  const reviewRecovery = async () => {
    if (busy || uncertain) return;
    setBusy(true);
    setError('');
    setRecoveryConfirmed(false);
    try {
      setRecoveryReview(await reviewMetaCampaignRecovery(draft.id));
    } catch (failure) {
      setRecoveryReview(null);
      setError(failure instanceof Error ? failure.message : 'Unable to verify recovery.');
    } finally { setBusy(false); }
  };
  const recover = async () => {
    if (busy || uncertain || !recoveryConfirmed || !recoveryReview) return;
    setBusy(true);
    setError('');
    try {
      setCreation(await recoverPausedMetaCampaign(draft.id));
      setRecoveryReview(null);
    } catch (failure) {
      setUncertain(true);
      setRecoveryReview(null);
      setError(failure instanceof Error ? failure.message : 'Recovery could not be confirmed. Refresh status; do not retry.');
    } finally {
      setRecoveryConfirmed(false);
      setBusy(false);
    }
  };
  const canRecover = creation?.status === 'needs_attention' && !creation.recovery_started_at
    && creation.placement !== 'instagram-feed'
    && creation.campaign_id && creation.adset_id && !creation.creative_id && !creation.ad_id
    && creation.error?.includes('subcode 1885183)');

  return <section aria-label="Create paused Meta campaign" className="mt-4 rounded-xl border border-cocoa/25 bg-cream/50 p-4">
    <h5 className="font-semibold text-cocoa">Final review: create in Meta, paused</h5>
    <p className="mt-2 text-sm text-cocoa/80">
      This sends the approved copy and selected product image to Meta and creates a new campaign, ad set and ad.
      All three are paused. Activation stays manual in Ads Manager. Campaigns from other proposals are never changed.
    </p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{formatMetaCreationError(error)}</p>}
    {loading && <p role="status" className="mt-3 text-sm">Checking setup and prior creation attempts...</p>}
    <div className="mt-3 rounded-xl border border-cocoa/25 p-3 text-sm">
      <button type="button" disabled={busy || loading} onClick={() => void checkInstagram()}
        className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
        {checkingInstagram ? 'Checking Instagram connection...' : 'Check Instagram connection (read-only)'}
      </button>
      {instagram && <p className="mt-2">Verified Instagram identity: <strong>@{instagram.username}</strong> ({instagram.id}).
        Linked to the configured Page and authorized for this ad account.</p>}
      <p className="mt-2">This check does not create an ad, publish a post or change an existing attempt.</p>
    </div>
    {creation && <div className="mt-3 text-sm text-cocoa">
      <p role="status">{creation.status === 'created'
        ? 'Created in Meta; campaign, ad set and ad were verified paused. Activation is manual in Meta.'
        : 'Creation is incomplete or needs attention. Do not retry or create another proposal to bypass this check; inspect Ads Manager and contact the operator.'}</p>
      {creation.error && <p className="mt-2 text-red-700"><strong>Saved error from the previous attempt:</strong> {formatMetaCreationError(creation.error)}</p>}
      {creation.placement === 'instagram-feed' && <p className="mt-2">Saved placement: Instagram Feed only.</p>}
      {creation.campaign_id && <a target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-block min-h-10 py-2 font-semibold underline"
        href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${creation.account_id}&selected_campaign_ids=${creation.campaign_id}`}>
        Review campaign in Meta Ads Manager
      </a>}
      <p className="mt-2 text-xs">Saved status is a creation-time snapshot; subsequent manual changes in Meta are not synchronized here.</p>
      {canRecover && !uncertain && <div className="mt-4 grid gap-3 rounded-xl border border-cocoa/25 p-3">
        <h6 className="font-semibold">Recover saved traffic ad</h6>
        <p>After publishing the Meta app, discard any manually started ad draft in Ads Manager.
          Recovery reuses this attempt&apos;s paused campaign and ad set, with the original saved image, copy,
          locations, schedule and lifetime budget. It never creates another campaign or ad set.</p>
        {!recoveryReview && <button type="button" disabled={busy || loading} onClick={() => void reviewRecovery()}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
          {busy ? 'Verifying saved recovery...' : 'Review saved recovery'}
        </button>}
        {recoveryReview && <>
          <p><strong>Campaign:</strong> {recoveryReview.plan.campaignName} ({recoveryReview.campaignId})<br />
            <strong>Ad set:</strong> {recoveryReview.adsetId}<br />
            <strong>Account:</strong> {recoveryReview.accountId}<br />
            <strong>Page:</strong> {recoveryReview.pageId}<br />
            <strong>Placement:</strong> Facebook Feed only, ages 18+<br />
            <strong>Locations:</strong> {recoveryReview.locationLabel}</p>
          <img src={recoveryReview.plan.imageUrl} alt="Saved recovery product image" className="h-48 w-48 rounded-xl object-contain" />
          <p className="whitespace-pre-wrap"><strong>Primary text:</strong> {recoveryReview.plan.primaryText}</p>
          <p><strong>Headline:</strong> {recoveryReview.plan.headline}<br />
            <strong>Description:</strong> {recoveryReview.plan.description}<br />
            <strong>Destination:</strong> {recoveryReview.plan.destination}<br />
            <strong>Call to action:</strong> {recoveryReview.plan.callToAction === 'SHOP_NOW' ? 'Shop now' : 'Learn more'}<br />
            <strong>Lifetime media budget:</strong> {money(recoveryReview.plan.lifetimeBudget / 100)} (not a daily cap; taxes/fees may be extra)<br />
            <strong>Start:</strong> {new Date(recoveryReview.plan.startTime).toLocaleString('en-IN')}<br />
            <strong>End:</strong> {new Date(recoveryReview.plan.endTime).toLocaleString('en-IN')}</p>
          <p>Recovery keeps the original dates and budget unchanged, even if the saved start is near or has passed.
            Keep delivery paused and review the schedule in Ads Manager before activating; activation does not restart the full duration.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={recoveryConfirmed} disabled={busy}
              onChange={event => setRecoveryConfirmed(event.target.checked)} className="mt-1" />
            <span>I published the Meta app, discarded any manual ad draft, and reviewed the saved image, copy,
              rights, claims, destination, locations, schedule and budget. Complete only this ad, paused;
              activation stays manual in Meta.</span>
          </label>
          <button type="button" disabled={busy || !recoveryConfirmed} onClick={() => void recover()}
            className="min-h-11 rounded-full bg-cocoa px-4 font-semibold text-cream disabled:opacity-50">
            {busy ? 'Recovering paused ad...' : 'Confirm and recover paused ad'}
          </button>
        </>}
      </div>}
    </div>}
    {!loading && !creation && setup && !uncertain && <form onSubmit={event => void submit(event)} className="mt-4 grid gap-3">
      <p className="text-sm"><strong>Account:</strong> {setup.accountName} ({setup.accountId})<br />
        <strong>Facebook Page:</strong> {setup.pageName} ({setup.pageId})</p>
      {p.goal === 'sales' && setup.pixelId && <p className="text-sm"><strong>Pixel:</strong> {setup.pixelId} / Purchase event</p>}
      <p className="text-sm"><strong>Campaign:</strong> {p.campaignName}<br />
        <strong>Goal:</strong> {p.goal} {p.goal === 'sales' && '(Purchase-event conversion optimization)'}<br />
        <strong>Placement:</strong> {placement === 'instagram-feed' ? 'Instagram' : 'Facebook'} Feed only, ages 18+, no interests or personal-trait targeting.<br />
        <strong>Destination:</strong> {p.landingPageUrl}<br />
        <strong>Call to action:</strong> {p.callToAction}</p>
      {!supported && <p role="alert" className="text-sm text-red-700">
        {p.callToAction === 'Send message' ? 'Messaging ads are not supported. Approve a website-ad proposal instead.'
          : 'Sales ads require the operator to configure a Meta pixel that receives Purchase events.'}
      </p>}
      <fieldset disabled={busy || !supported} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Ad placement
          <select value={placement} onChange={event => {
            if (event.target.value === 'facebook-feed' || event.target.value === 'instagram-feed') {
              setPlacement(event.target.value);
              setConfirmed(false);
            }
          }} className="min-h-11 rounded-xl border border-cocoa/25 px-3">
            <option value="facebook-feed">Facebook Feed only</option>
            <option value="instagram-feed">Instagram Feed only</option>
          </select>
        </label>
        {placement === 'instagram-feed' && <p className="text-sm">
          {instagram ? `Advertised Instagram identity: @${instagram.username}.` : 'Check the Instagram connection above before confirming.'}
          {' '}Single-image Feed ads only, not Stories, Reels or organic posts. Review Meta&apos;s image crop before activation.
          This creates a separate campaign with its own full lifetime budget, not a shared Facebook budget.
          A proposal has only one creation attempt; existing Facebook attempts cannot be converted.
          Meta billing requirements still apply to paused ads; resolve any billing restriction before creation.
        </p>}
        <label className="grid gap-1 text-sm">
          Published product image for this ad
          <select required value={productId} onChange={event => { setProductId(event.target.value); setConfirmed(false); }}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3">
            <option value="">Select an image from admin products</option>
            {products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {product && <img src={product.image} alt={`Selected ad image: ${product.name}`} className="h-48 w-48 rounded-xl object-contain" />}
        <label className="grid gap-1 text-sm">
          Primary text to send
          <select value={primaryTextIndex} onChange={event => { setPrimaryTextIndex(Number(event.target.value)); setConfirmed(false); }}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3">
            {p.primaryText.map((_, index) => <option key={index} value={index}>Option {index + 1}</option>)}
          </select>
        </label>
        <p className="whitespace-pre-wrap text-sm">{p.primaryText[primaryTextIndex]}</p>
        <label className="grid gap-1 text-sm">
          Headline to send
          <select value={headlineIndex} onChange={event => { setHeadlineIndex(Number(event.target.value)); setConfirmed(false); }}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3">
            {p.headlines.map((_, index) => <option key={index} value={index}>Option {index + 1}</option>)}
          </select>
        </label>
        <p className="text-sm">{p.headlines[headlineIndex]}<br />{p.description}</p>
        <p className="text-sm">Proposal location guidance: {p.targetLocation}. Confirm actual Meta locations below; saved guidance is not a targeting specification.</p>
        <MarketingLocationPicker disabled={busy} initialCoverage={countryDefault ? 'country' : 'specific'} planningOnly={false}
          onChange={(label, selected) => { setLocationLabel(label); setLocations(selected); setConfirmed(false); }} />
        <label className="grid gap-1 text-sm">
          Planned start (your local time)
          <input required type="datetime-local" value={startTime}
            onChange={event => { setStartTime(event.target.value); setConfirmed(false); }}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
        </label>
        <p className="text-sm">
          Lifetime media budget: <strong>{money(p.totalBudgetInr)}</strong> over {p.durationDays} days
          (planning average {money(p.dailyBudgetInr)}/day, not a daily cap). End time is start plus {p.durationDays} days.
          Planned end (your local time): {endLabel}.
          Meta taxes/fees may be additional. If activation is delayed, review the schedule in Meta before activating.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
          <span>I reviewed the copy, image rights, product claims, destination, locations, schedule and lifetime budget
            {p.goal === 'sales' ? ', and verified that the configured pixel receives Purchase events' : ''}.
            {placement === 'instagram-feed' ? ` Use @${instagram?.username ?? '(verify Instagram first)'} for Instagram Feed only.` : ''}
            Create paused only; I will review and activate manually in Meta.</span>
        </label>
        <button type="submit" disabled={!confirmed || !productId || !locationLabel || !instagramReady || busy}
          className="min-h-11 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream disabled:opacity-50">
          {checkingInstagram ? 'Checking Instagram connection...' : busy ? 'Creating paused objects...' : 'Confirm and create paused campaign'}
        </button>
      </fieldset>
    </form>}
    {uncertain && <p className="mt-3 text-sm">The result is uncertain. Refresh status before any further attempt; an interrupted request may have created paused objects.</p>}
    <button type="button" disabled={busy || loading} onClick={() => {
      setLoading(true);
      setSetup(null);
      setError('');
      setConfirmed(false);
      setRecoveryReview(null);
      setRecoveryConfirmed(false);
      setInstagram(undefined);
      setAttempt(value => value + 1);
    }}
      className="mt-3 min-h-10 rounded-full border border-cocoa/30 px-4 text-sm font-semibold disabled:opacity-50">
      Refresh Meta creation status
    </button>
  </section>;
}
