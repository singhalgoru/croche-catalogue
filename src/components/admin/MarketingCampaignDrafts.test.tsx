import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  generateMarketingCampaignProposal,
  listMarketingCampaignDrafts,
  reviewMarketingCampaignDraft,
  saveMarketingCampaignDraft,
} = vi.hoisted(() => ({
  generateMarketingCampaignProposal: vi.fn(),
  listMarketingCampaignDrafts: vi.fn(),
  reviewMarketingCampaignDraft: vi.fn(),
  saveMarketingCampaignDraft: vi.fn(),
}));
vi.mock('../../services/marketing', () => ({
  generateMarketingCampaignProposal,
  listMarketingCampaignDrafts,
  reviewMarketingCampaignDraft,
  saveMarketingCampaignDraft,
}));

import MarketingCampaignDrafts from './MarketingCampaignDrafts';

const proposal = {
  productOrOffer: 'Handmade crochet flowers',
  goal: 'sales' as const,
  landingPageUrl: 'https://luviacreations.com/products/flowers',
  targetLocation: 'Mumbai',
  dailyBudgetInr: 500,
  durationDays: 7,
  campaignName: 'Handmade crochet flowers',
  audienceSummary: 'Broad audience in Mumbai.',
  creativeDirection: 'Show the crochet flowers in a bright, simple setting.',
  primaryText: ['A handmade crochet flower for your space.', 'Discover crochet flowers made by hand.'],
  headlines: ['Handmade crochet flowers', 'A thoughtful handmade gift'],
  description: 'Explore handmade crochet flowers.',
  callToAction: 'Shop now' as const,
  assumptions: ['Confirm current product availability.', 'Confirm the landing page is correct.'],
  totalBudgetInr: 3500,
};
const draft = {
  id: 'draft-1',
  brief: proposal,
  proposal,
  status: 'draft' as const,
  createdAt: '2026-11-17T10:00:00.000Z',
  reviewedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  listMarketingCampaignDrafts.mockResolvedValue([]);
  generateMarketingCampaignProposal.mockResolvedValue(proposal);
  saveMarketingCampaignDraft.mockResolvedValue(draft);
});
afterEach(cleanup);

it('generates, lets the admin review copy, and saves an unpublished proposal', async () => {
  render(<MarketingCampaignDrafts />);
  await screen.findByText('No saved proposals yet.');
  fireEvent.change(screen.getByLabelText('Product or offer facts'), { target: { value: 'Handmade crochet flowers' } });
  fireEvent.change(screen.getByLabelText('Target location'), { target: { value: 'Mumbai' } });
  fireEvent.change(screen.getByLabelText('Luvia product page URL'), { target: { value: proposal.landingPageUrl } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI proposal' }));
  expect(await screen.findByText('Review generated proposal')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Primary text option 1'), { target: { value: 'Reviewed copy.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft for review' }));
  await waitFor(() => expect(saveMarketingCampaignDraft).toHaveBeenCalledWith(
    expect.objectContaining({ productOrOffer: 'Handmade crochet flowers' }),
    expect.objectContaining({ primaryText: ['Reviewed copy.', proposal.primaryText[1]] }),
  ));
  expect(await screen.findByText('Draft saved for admin review. It has not been sent to Meta.')).toBeTruthy();
  expect(generateMarketingCampaignProposal).toHaveBeenCalledTimes(1);
});

it('marks a reviewed proposal approved without claiming that it was published', async () => {
  listMarketingCampaignDrafts.mockResolvedValue([draft]);
  reviewMarketingCampaignDraft.mockResolvedValue({
    ...draft,
    status: 'approved',
    reviewedAt: '2026-11-17T10:05:00.000Z',
  });
  render(<MarketingCampaignDrafts />);
  await screen.findByRole('heading', { name: 'Handmade crochet flowers', level: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Approve internally' }));
  expect(await screen.findByText('Proposal approved internally; no changes were sent to Meta.')).toBeTruthy();
  await waitFor(() => expect(reviewMarketingCampaignDraft).toHaveBeenCalledWith('draft-1', 'approved'));
  expect(screen.getByText('Approved internally')).toBeTruthy();
});

it('records a rejected proposal as a review outcome only', async () => {
  listMarketingCampaignDrafts.mockResolvedValue([draft]);
  reviewMarketingCampaignDraft.mockResolvedValue({
    ...draft,
    status: 'rejected',
    reviewedAt: '2026-11-17T10:05:00.000Z',
  });
  render(<MarketingCampaignDrafts />);
  await screen.findByRole('heading', { name: 'Handmade crochet flowers', level: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Reject proposal' }));
  expect(await screen.findByText('Proposal rejected; no changes were sent to Meta.')).toBeTruthy();
  await waitFor(() => expect(reviewMarketingCampaignDraft).toHaveBeenCalledWith('draft-1', 'rejected'));
  expect(screen.getByText('Rejected')).toBeTruthy();
});
