import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fetchManagedProducts } from '../../services/products';
import type { Product } from '../../types/product';
import { toProductPageUrl } from '../../utils/productLink';
import MarketingLocationPicker from './MarketingLocationPicker';
import MarketingMetaCreation from './MarketingMetaCreation';
import {
  generateMarketingCampaignProposal,
  listMarketingCampaignDrafts,
  reviewMarketingCampaignDraft,
  saveMarketingCampaignDraft,
  type MarketingCampaignBrief,
  type MarketingCampaignProposal,
  type SavedMarketingCampaignDraft,
} from '../../services/marketing';

const initialBrief: MarketingCampaignBrief = {
  productOrOffer: '',
  goal: 'sales',
  landingPageUrl: '',
  targetLocation: 'India',
  dailyBudgetInr: 500,
  durationDays: 7,
};

const statusLabel: Record<SavedMarketingCampaignDraft['status'], string> = {
  draft: 'Awaiting review',
  approved: 'Approved internally',
  rejected: 'Rejected',
};

const currency = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(amount);

export default function MarketingCampaignDrafts() {
  const [brief, setBrief] = useState(initialBrief);
  const [proposal, setProposal] = useState<MarketingCampaignProposal | null>(null);
  const [drafts, setDrafts] = useState<SavedMarketingCampaignDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productLoadAttempt, setProductLoadAttempt] = useState(0);
  const [metaDraftId, setMetaDraftId] = useState('');

  const refreshDrafts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDrafts(await listMarketingCampaignDrafts());
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load campaign drafts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listMarketingCampaignDrafts().then(value => {
      if (active) setDrafts(value);
    }).catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load campaign drafts.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchManagedProducts().then(value => {
      if (active) setProducts(value.filter(product => product.published));
    }).catch(failure => {
      if (active) setProductsError(failure instanceof Error ? failure.message : 'Unable to load published products.');
    }).finally(() => {
      if (active) setProductsLoading(false);
    });
    return () => { active = false; };
  }, [productLoadAttempt]);

  const selectProduct = (id: string) => {
    setSelectedProductId(id);
    if (!id) return;
    const product = products.find(item => item.id === id);
    if (!product) {
      setProductsError('The selected product is no longer available. Reload published products.');
      return;
    }
    const facts = [product.name, product.description].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
    const page = new URL(toProductPageUrl(product));
    setBrief(current => ({
      ...current,
      productOrOffer: facts,
      landingPageUrl: new URL(page.pathname, 'https://luviacreations.com').href,
    }));
    setProposal(null);
    setMessage('');
  };

  const updateBrief = <K extends keyof MarketingCampaignBrief>(key: K, value: MarketingCampaignBrief[K]) => {
    setBrief(current => ({ ...current, [key]: value }));
    setProposal(null);
    setMessage('');
  };

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('generate');
    setError('');
    setMessage('');
    try {
      setProposal(await generateMarketingCampaignProposal(brief));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to generate a campaign proposal.');
    } finally {
      setBusy('');
    }
  };

  const updateProposalText = (
    field: 'primaryText' | 'headlines',
    index: number,
    value: string,
  ) => {
    setProposal(current => current
      ? { ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? value : item) }
      : current);
  };

  const save = async () => {
    if (!proposal) return;
    setBusy('save');
    setError('');
    setMessage('');
    try {
      await saveMarketingCampaignDraft(brief, proposal);
      setProposal(null);
      setMessage('Draft saved for admin review. It has not been sent to Meta.');
      await refreshDrafts();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save the campaign draft.');
    } finally {
      setBusy('');
    }
  };

  const review = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      const updated = await reviewMarketingCampaignDraft(id, decision);
      setDrafts(current => current.map(draft => draft.id === id ? updated : draft));
      setMessage(decision === 'approved'
        ? 'Proposal approved internally; no changes were sent to Meta.'
        : 'Proposal rejected; no changes were sent to Meta.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to update the draft review.');
    } finally {
      setBusy('');
    }
  };

  return <section aria-label="AI campaign proposals" className="mt-5 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <h2 className="font-heading text-xl font-bold text-cocoa">AI campaign proposals</h2>
    <p className="mt-1 text-sm text-cocoa/70">
      Generate and review proposal copy. Approval is internal only. Sending an approved proposal to Meta requires a separate confirmation and creates paused objects only.
    </p>
    <p className="mt-2 rounded-xl bg-cream p-3 text-xs text-cocoa/70">
      No advertising spend will occur here; activation stays manual in Meta. AI generation may incur Gemini charges. Do not enter customer personal data.
    </p>

    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-cocoa">{message}</p>}

    <form onSubmit={event => void generate(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="grid gap-1 text-sm font-medium text-cocoa">
          Published product
          <select value={selectedProductId} disabled={busy !== '' || productsLoading}
            onChange={event => selectProduct(event.target.value)}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3">
            <option value="">{productsLoading ? 'Loading published products...' : 'Custom product or offer (enter manually)'}</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <p className="mt-1 text-xs text-cocoa/70">
          Selecting a published product fills its full name and description and page URL. Both remain editable.
        </p>
        {!productsLoading && !productsError && products.length === 0
          && <p className="mt-1 text-sm text-cocoa/70">No published products available. Enter a custom offer below.</p>}
        {productsError && <div className="mt-2">
          <p role="alert" className="text-sm text-red-700">{productsError}</p>
          <button type="button" disabled={busy !== '' || productsLoading} onClick={() => {
            setProductsLoading(true);
            setProductsError('');
            setProductLoadAttempt(current => current + 1);
          }} className="mt-2 min-h-10 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa disabled:opacity-50">
            Reload published products
          </button>
        </div>}
      </div>
      <label className="grid gap-1 text-sm font-medium text-cocoa sm:col-span-2">
        Product or offer facts
        <textarea required maxLength={10000} disabled={busy !== ''} value={brief.productOrOffer}
          onChange={event => updateBrief('productOrOffer', event.target.value)}
          className="min-h-20 rounded-xl border border-cocoa/25 p-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-cocoa">
        Campaign goal
        <select disabled={busy !== ''} value={brief.goal}
          onChange={event => updateBrief('goal', event.target.value as MarketingCampaignBrief['goal'])}
          className="min-h-11 rounded-xl border border-cocoa/25 px-3">
          <option value="sales">Sales</option>
          <option value="traffic">Website traffic</option>
          <option value="awareness">Awareness</option>
        </select>
      </label>
      <MarketingLocationPicker disabled={busy !== ''} onChange={value => updateBrief('targetLocation', value)} />
      <label className="grid gap-1 text-sm font-medium text-cocoa sm:col-span-2">
        Luvia product page URL
        <input required type="url" pattern="https://(www\.)?luviacreations\.com(/.*)?"
          disabled={busy !== ''}
          value={brief.landingPageUrl} onChange={event => updateBrief('landingPageUrl', event.target.value)}
          className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-cocoa">
        Planning daily budget (INR)
        <input required type="number" min={100} max={100000} step={1} disabled={busy !== ''} value={brief.dailyBudgetInr}
          onChange={event => updateBrief('dailyBudgetInr', Number(event.target.value))}
          className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
      </label>
      <label className="grid gap-1 text-sm font-medium text-cocoa">
        Planned duration (days)
        <input required type="number" min={1} max={30} step={1} disabled={busy !== ''} value={brief.durationDays}
          onChange={event => updateBrief('durationDays', Number(event.target.value))}
          className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
      </label>
      <button type="submit" disabled={busy !== '' || !brief.targetLocation}
        className="min-h-11 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream disabled:opacity-50 sm:col-span-2">
        {busy === 'generate' ? 'Generating proposal…' : 'Generate AI proposal'}
      </button>
    </form>

    {proposal && <div className="mt-5 rounded-xl border border-cocoa/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg font-bold text-cocoa">Review generated proposal</h3>
        <p className="text-sm text-cocoa/70">
          {currency(proposal.dailyBudgetInr)}/day · {proposal.durationDays} days · {currency(proposal.totalBudgetInr)} planned total
        </p>
      </div>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-cocoa">
          Campaign name
          <input maxLength={80} disabled={busy !== ''} value={proposal.campaignName}
            onChange={event => setProposal({ ...proposal, campaignName: event.target.value })}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
        </label>
        <p className="text-sm text-cocoa"><strong>Audience guidance:</strong> {proposal.audienceSummary}</p>
        <p className="text-sm text-cocoa"><strong>Creative direction:</strong> {proposal.creativeDirection}</p>
        {proposal.primaryText.map((text, index) => <label key={`primary-${index}`} className="grid gap-1 text-sm font-medium text-cocoa">
          Primary text option {index + 1}
          <textarea maxLength={500} disabled={busy !== ''} value={text}
            onChange={event => updateProposalText('primaryText', index, event.target.value)}
            className="min-h-20 rounded-xl border border-cocoa/25 p-3" />
        </label>)}
        {proposal.headlines.map((text, index) => <label key={`headline-${index}`} className="grid gap-1 text-sm font-medium text-cocoa">
          Headline option {index + 1}
          <input maxLength={60} disabled={busy !== ''} value={text}
            onChange={event => updateProposalText('headlines', index, event.target.value)}
            className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
        </label>)}
        <p className="text-sm text-cocoa"><strong>Description:</strong> {proposal.description}</p>
        <p className="text-sm text-cocoa"><strong>Call to action:</strong> {proposal.callToAction}</p>
        <p className="text-sm text-cocoa"><strong>Destination:</strong> {proposal.landingPageUrl}</p>
        <div className="text-sm text-cocoa">
          <strong>Verify before any future use:</strong>
          <ul className="list-disc pl-5">{proposal.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
      <button type="button" onClick={() => void save()} disabled={busy !== ''}
        className="mt-4 min-h-11 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream disabled:opacity-50">
        {busy === 'save' ? 'Saving…' : 'Save draft for review'}
      </button>
    </div>}

    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-bold text-cocoa">Saved proposals</h3>
        <button type="button" onClick={() => void refreshDrafts()} disabled={loading || busy !== ''}
          className="min-h-10 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa disabled:opacity-50">
          {loading ? 'Loading…' : 'Refresh drafts'}
        </button>
      </div>
      {loading && <p role="status" className="mt-2 text-sm text-cocoa/70">Loading saved proposals…</p>}
      {!loading && !error && drafts.length === 0 && <p className="mt-2 text-sm text-cocoa/70">No saved proposals yet.</p>}
      <ul className="mt-3 grid gap-3">
        {drafts.map(draft => <li key={draft.id} className="rounded-xl border border-cocoa/15 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-semibold text-cocoa">{draft.proposal.campaignName}</h4>
            <span className="text-xs font-semibold text-cocoa/70">{statusLabel[draft.status]}</span>
          </div>
          <p className="mt-1 text-sm text-cocoa/80">
            {draft.brief.goal} · {draft.brief.targetLocation} · {currency(draft.brief.dailyBudgetInr)}/day for {draft.brief.durationDays} days
            ({currency(draft.proposal.totalBudgetInr)} planned total)
          </p>
          <p className="mt-2 text-sm text-cocoa">{draft.proposal.primaryText[0]}</p>
          <p className="mt-1 text-sm text-cocoa/75">{draft.proposal.headlines.join(' · ')}</p>
          <p className="mt-1 break-all text-xs text-cocoa/65">{draft.proposal.landingPageUrl}</p>
          <details className="mt-3 text-sm text-cocoa">
            <summary className="cursor-pointer font-semibold">Full proposal and verification checklist</summary>
            <p className="mt-2"><strong>Product facts:</strong> {draft.brief.productOrOffer}</p>
            <p className="mt-2"><strong>Audience guidance:</strong> {draft.proposal.audienceSummary}</p>
            <p className="mt-2"><strong>Creative direction:</strong> {draft.proposal.creativeDirection}</p>
            <p className="mt-2"><strong>Primary text option 2:</strong> {draft.proposal.primaryText[1]}</p>
            <p className="mt-2"><strong>Description:</strong> {draft.proposal.description}</p>
            <p className="mt-2"><strong>Call to action:</strong> {draft.proposal.callToAction}</p>
            <ul className="mt-2 list-disc pl-5">
              {draft.proposal.assumptions.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </details>
          {draft.reviewedAt && <p className="mt-1 text-xs text-cocoa/65">
            Reviewed {new Date(draft.reviewedAt).toLocaleString('en-IN')}
          </p>}
          {draft.status === 'draft' && <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void review(draft.id, 'approved')} disabled={busy !== ''}
              className="min-h-10 rounded-full bg-cocoa px-4 text-sm font-semibold text-cream disabled:opacity-50">
              {busy === draft.id ? 'Saving review…' : 'Approve internally'}
            </button>
            <button type="button" onClick={() => void review(draft.id, 'rejected')} disabled={busy !== ''}
              className="min-h-10 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa disabled:opacity-50">
              Reject proposal
            </button>
          </div>}
          {draft.status === 'approved' && <div className="mt-3">
            <button type="button" disabled={busy !== ''} onClick={() => setMetaDraftId(current => current === draft.id ? '' : draft.id)}
              className="min-h-10 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa disabled:opacity-50">
              {metaDraftId === draft.id ? 'Close Meta creation review' : 'Create paused campaign in Meta'}
            </button>
            {metaDraftId === draft.id && <MarketingMetaCreation key={draft.id} draft={draft} products={products} />}
          </div>}
        </li>)}
      </ul>
    </div>
  </section>;
}
