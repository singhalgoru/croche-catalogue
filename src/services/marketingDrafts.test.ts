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
