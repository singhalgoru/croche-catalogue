import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { fetchManagedProducts } = vi.hoisted(() => ({ fetchManagedProducts: vi.fn() }));
vi.mock('../../services/products', () => ({ fetchManagedProducts }));

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
  fetchManagedProducts.mockResolvedValue([]);
  listMarketingCampaignDrafts.mockResolvedValue([]);
  generateMarketingCampaignProposal.mockResolvedValue(proposal);
  saveMarketingCampaignDraft.mockResolvedValue(draft);
});
afterEach(cleanup);

const publishedProduct = {
  id: 'flowers',
  publicSlug: 'crochet-flowers',
  name: 'Crochet flowers',
  description: 'Handmade flowers in cotton yarn.',
  published: true,
};

it('autofills published product facts and its public URL, allowing manual edits and custom offers', async () => {
  fetchManagedProducts.mockResolvedValue([publishedProduct, {
    ...publishedProduct, id: 'unpublished', name: 'Unpublished draft', published: false,
  }]);
  render(<MarketingCampaignDrafts />);
  await screen.findByRole('option', { name: 'Crochet flowers' });
  expect(fetchManagedProducts).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('option', { name: 'Unpublished draft' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Published product'), { target: { value: 'flowers' } });
  expect(screen.getByLabelText<HTMLTextAreaElement>('Product or offer facts').value)
    .toBe('Crochet flowers: Handmade flowers in cotton yarn.');
  expect(screen.getByLabelText<HTMLInputElement>('Luvia product page URL').value)
    .toBe('https://luviacreations.com/p/crochet-flowers/');
  fireEvent.change(screen.getByLabelText('Product or offer facts'), { target: { value: 'Reviewed product facts' } });
  fireEvent.change(screen.getByLabelText('Published product'), { target: { value: '' } });
  expect(screen.getByLabelText<HTMLTextAreaElement>('Product or offer facts').value).toBe('Reviewed product facts');
  fireEvent.change(screen.getByLabelText('Target location'), { target: { value: 'Mumbai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI proposal' }));
  await screen.findByText('Review generated proposal');
  fireEvent.change(screen.getByLabelText('Published product'), { target: { value: 'flowers' } });
  expect(screen.queryByText('Review generated proposal')).toBeNull();
});

it('limits prefilled facts to the brief limit without including price data', async () => {
  fetchManagedProducts.mockResolvedValue([{ ...publishedProduct, description: 'x'.repeat(250), price: 500, showPrice: false }]);
  render(<MarketingCampaignDrafts />);
  await screen.findByRole('option', { name: 'Crochet flowers' });
  fireEvent.change(screen.getByLabelText('Published product'), { target: { value: 'flowers' } });
  expect(screen.getByLabelText<HTMLTextAreaElement>('Product or offer facts').value)
    .toBe(`Crochet flowers: ${'x'.repeat(250)}`.slice(0, 180));
});

it('reports product-loading errors and supports retry without blocking manual entry', async () => {
  fetchManagedProducts.mockRejectedValueOnce(new Error('Product list unavailable.'));
  render(<MarketingCampaignDrafts />);
  expect(await screen.findByText('Product list unavailable.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Product or offer facts'), { target: { value: 'Custom offer' } });
  fetchManagedProducts.mockResolvedValueOnce([publishedProduct]);
  fireEvent.click(screen.getByRole('button', { name: 'Reload published products' }));
  await screen.findByRole('option', { name: 'Crochet flowers' });
  expect(screen.queryByText('Product list unavailable.')).toBeNull();
  expect(screen.getByLabelText<HTMLTextAreaElement>('Product or offer facts').value).toBe('Custom offer');
});

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
