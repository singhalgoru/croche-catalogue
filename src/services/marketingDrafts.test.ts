import { beforeEach, expect, it, vi } from 'vitest';

const { loadSupabase, invoke, from, rpc } = vi.hoisted(() => ({
  loadSupabase: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase }));

import {
  generateMarketingCampaignProposal,
  listMarketingCampaignDrafts,
  reviewMarketingCampaignDraft,
  saveMarketingCampaignDraft,
  createPausedMetaCampaign,
  fetchMetaCampaignCreation,
  fetchMetaCreationSetup,
  type MarketingCampaignBrief,
  type MarketingCampaignProposal,
} from './marketing';

const brief: MarketingCampaignBrief = {
  productOrOffer: 'Handmade crochet flowers',
  goal: 'sales',
  landingPageUrl: 'https://luviacreations.com/products/flowers',
  targetLocation: 'Mumbai',
  dailyBudgetInr: 500,
  durationDays: 7,
};
const proposal: MarketingCampaignProposal = {
  ...brief,
  campaignName: 'Handmade crochet flowers',
  audienceSummary: 'Broad audience in Mumbai.',
  creativeDirection: 'Show the crochet flowers in a bright, simple setting.',
  primaryText: ['A handmade crochet flower for your space.', 'Discover crochet flowers made by hand.'],
  headlines: ['Handmade crochet flowers', 'A thoughtful handmade gift'],
  description: 'Explore handmade crochet flowers.',
  callToAction: 'Shop now',
  assumptions: ['Confirm current product availability.', 'Confirm the landing page is correct.'],
  totalBudgetInr: 3500,
};
const row = {
  id: 'draft-1',
  brief,
  proposal,
  status: 'draft',
  created_at: '2026-11-17T10:00:00.000Z',
  reviewed_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadSupabase.mockResolvedValue({ functions: { invoke }, from, rpc });
});

it('validates generated proposals and only invokes the draft-generation function', async () => {
  invoke.mockResolvedValueOnce({ data: { proposal }, error: null });
  await expect(generateMarketingCampaignProposal(brief)).resolves.toEqual(proposal);
  expect(invoke).toHaveBeenCalledWith('marketing-draft', { body: brief });

  invoke.mockResolvedValueOnce({
    data: { proposal: { ...proposal, totalBudgetInr: 1 } },
    error: null,
  });
  await expect(generateMarketingCampaignProposal(brief)).rejects.toThrow('Invalid campaign proposal response.');
});

it('loads and saves only well-formed RLS-backed draft records', async () => {
  const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  from.mockReturnValueOnce({ select });
  await expect(listMarketingCampaignDrafts()).resolves.toMatchObject([{ id: 'draft-1', status: 'draft' }]);
  expect(from).toHaveBeenCalledWith('marketing_campaign_drafts');

  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const insertSelect = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });
  from.mockReturnValueOnce({ insert });
  await expect(saveMarketingCampaignDraft(brief, proposal)).resolves.toMatchObject({ id: 'draft-1' });
  expect(insert).toHaveBeenCalledWith({ brief, proposal });
});

it('preserves model provenance through generation and saving, rejecting invalid metadata', async () => {
  const generated = { ...proposal, generation: { model: 'gemini-3.1-flash-lite', fallbackUsed: true } };
  invoke.mockResolvedValueOnce({ data: { proposal: generated }, error: null });
  await expect(generateMarketingCampaignProposal(brief)).resolves.toEqual(generated);
  const single = vi.fn().mockResolvedValue({ data: { ...row, proposal: generated }, error: null });
  const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
  from.mockReturnValueOnce({ insert });
  await expect(saveMarketingCampaignDraft(brief, generated)).resolves.toMatchObject({ proposal: generated });
  expect(insert).toHaveBeenCalledWith({ brief, proposal: generated });
  invoke.mockResolvedValueOnce({
    data: { proposal: { ...generated, generation: { ...generated.generation, fallbackUsed: 'yes' } } }, error: null,
  });
  await expect(generateMarketingCampaignProposal(brief)).rejects.toThrow('Invalid campaign generation details.');
});
it('records review decisions through the one-way review RPC', async () => {
  rpc.mockResolvedValueOnce({
    data: { ...row, status: 'approved', reviewed_at: '2026-11-17T10:05:00.000Z' },
    error: null,
  });
  await expect(reviewMarketingCampaignDraft('draft-1', 'approved'))
    .resolves.toMatchObject({ status: 'approved', reviewedAt: '2026-11-17T10:05:00.000Z' });
  expect(rpc).toHaveBeenCalledWith('review_marketing_campaign_draft', {
    target_id: 'draft-1',
    decision: 'approved',
  });
});

it('rejects emptied edited copy before persisting a draft', async () => {
  await expect(saveMarketingCampaignDraft(brief, { ...proposal, campaignName: '' }))
    .rejects.toThrow('Invalid campaign proposal response.');
  expect(from).not.toHaveBeenCalled();
});

it('accepts and saves the complete product facts returned by generation', async () => {
  const productOrOffer = `${'Complete product facts. '.repeat(40)}Final product detail.`;
  const targetLocation = 'Mumbai, Maharashtra, India; Bengaluru, Karnataka, India; Pune, Maharashtra, India; Chennai, Tamil Nadu, India';
  const fullBrief = { ...brief, productOrOffer, targetLocation };
  const fullProposal = { ...proposal, productOrOffer, targetLocation };
  invoke.mockResolvedValueOnce({ data: { proposal: fullProposal }, error: null });
  await expect(generateMarketingCampaignProposal(fullBrief)).resolves.toEqual(fullProposal);
  const single = vi.fn().mockResolvedValue({
    data: { ...row, brief: fullBrief, proposal: fullProposal }, error: null,
  });
  const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
  from.mockReturnValueOnce({ insert });
  await expect(saveMarketingCampaignDraft(fullBrief, fullProposal))
    .resolves.toMatchObject({ brief: fullBrief, proposal: fullProposal });
  expect(insert).toHaveBeenCalledWith({ brief: fullBrief, proposal: fullProposal });
});

it('loads creation setup and sends only an explicitly paused creation request', async () => {
  invoke.mockResolvedValueOnce({ data: { setup: {
    accountId: '123', accountName: 'Luvia', pageId: '456', pageName: 'Page', pixelId: null,
  } }, error: null });
  await expect(fetchMetaCreationSetup()).resolves.toMatchObject({ accountId: '123', pixelId: null });
  const input = {
    draftId: row.id, productId: 'product-1', primaryTextIndex: 0, headlineIndex: 1,
    startTime: '2030-01-01T10:00:00Z', locations: null,
  };
  const creation = {
    draft_id: row.id, status: 'created', account_id: '123', campaign_id: '10', adset_id: '20',
    creative_id: '30', ad_id: '40', error: null,
  };
  invoke.mockResolvedValueOnce({ data: { creation }, error: null });
  await expect(createPausedMetaCampaign(input)).resolves.toEqual(creation);
  expect(invoke).toHaveBeenLastCalledWith('marketing-create', { body: { ...input, action: 'create', confirmPaused: true } });
  invoke.mockResolvedValueOnce({ data: { creation: { ...creation, ad_id: null } }, error: null });
  await expect(createPausedMetaCampaign(input)).rejects.toThrow('Invalid Meta creation response.');
  invoke.mockResolvedValueOnce({ data: { creation: { ...creation, draft_id: 'other' } }, error: null });
  await expect(createPausedMetaCampaign(input)).rejects.toThrow('different proposal');
});

it('reads an existing creation ledger through RLS without invoking a Meta write', async () => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  from.mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle }) }) });
  await expect(fetchMetaCampaignCreation(row.id)).resolves.toBeNull();
  expect(from).toHaveBeenCalledWith('marketing_meta_creations');
  expect(invoke).not.toHaveBeenCalled();
});
