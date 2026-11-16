import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../../types/product';
import type { SavedMarketingCampaignDraft } from '../../services/marketing';

const mocks = vi.hoisted(() => ({
  createPausedMetaCampaign: vi.fn(), fetchMetaCampaignCreation: vi.fn(), fetchMetaCreationSetup: vi.fn(),
  reviewMetaCampaignRecovery: vi.fn(), recoverPausedMetaCampaign: vi.fn(),
}));
vi.mock('../../services/marketing', () => mocks);
import MarketingMetaCreation from './MarketingMetaCreation';

const draft: SavedMarketingCampaignDraft = {
  id: 'draft-1', status: 'approved', reviewedAt: '2026-11-16T10:00:00Z', createdAt: '2026-11-16T09:00:00Z',
  brief: { productOrOffer: 'Flowers', goal: 'traffic', landingPageUrl: 'https://luviacreations.com/p/flowers/', targetLocation: 'India', dailyBudgetInr: 500, durationDays: 7 },
  proposal: {
    productOrOffer: 'Flowers', goal: 'traffic', landingPageUrl: 'https://luviacreations.com/p/flowers/',
    targetLocation: 'India', dailyBudgetInr: 500, durationDays: 7, totalBudgetInr: 3500,
    campaignName: 'Flowers', primaryText: ['First copy', 'Second copy'], headlines: ['First headline', 'Second headline'],
    description: 'Handmade', callToAction: 'Shop now', audienceSummary: 'India', creativeDirection: 'Show flowers',
    assumptions: ['Check stock', 'Check claims'],
  },
};
const product: Product = {
  id: 'product-1', name: 'Flowers', category: 'Flowers', price: 500, description: 'Handmade',
  color: 'Pink', inStock: true, image: 'https://images.luviacreations.com/flower.webp', variants: [],
};
const result = {
  draft_id: draft.id, status: 'created', account_id: '123', campaign_id: '10', adset_id: '20', creative_id: '30', ad_id: '40', error: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetchMetaCampaignCreation.mockResolvedValue(null);
  mocks.fetchMetaCreationSetup.mockResolvedValue({ accountId: '123', accountName: 'Luvia', pageId: '456', pageName: 'Luvia Page', pixelId: null });
  mocks.createPausedMetaCampaign.mockResolvedValue(result);
});
afterEach(cleanup);

it('requires a separate final confirmation and sends selected approved copy indices, admin image and structured geography', async () => {
  render(<MarketingMetaCreation draft={draft} products={[product]} />);
  const submit = await screen.findByRole<HTMLButtonElement>('button', { name: 'Confirm and create paused campaign' });
  expect(submit.disabled).toBe(true);
  expect(mocks.createPausedMetaCampaign).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Published product image for this ad'), { target: { value: product.id } });
  expect(screen.getByAltText('Selected ad image: Flowers').getAttribute('src')).toBe(product.image);
  fireEvent.change(screen.getByLabelText('Primary text to send'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Headline to send'), { target: { value: '1' } });
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.createPausedMetaCampaign).toHaveBeenCalledWith(expect.objectContaining({
    draftId: draft.id, productId: product.id, primaryTextIndex: 1, headlineIndex: 1, locations: null,
  })));
  const link = await screen.findByRole('link', { name: 'Review campaign in Meta Ads Manager' });
  expect(link.getAttribute('href')).toBe('https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123&selected_campaign_ids=10');
  expect(screen.queryByRole('button', { name: 'Confirm and create paused campaign' })).toBeNull();
});

it('requires new structured targeting for old location guidance instead of silently targeting all India', async () => {
  render(<MarketingMetaCreation draft={{ ...draft, proposal: { ...draft.proposal, targetLocation: 'Mumbai' } }} products={[product]} />);
  const submit = await screen.findByRole<HTMLButtonElement>('button', { name: 'Confirm and create paused campaign' });
  fireEvent.change(screen.getByLabelText('Published product image for this ad'), { target: { value: product.id } });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(submit.disabled).toBe(true);
  expect(screen.getByLabelText<HTMLSelectElement>('Location coverage').value).toBe('specific');
  fireEvent.change(screen.getByLabelText('Location coverage'), { target: { value: 'country' } });
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(submit.disabled).toBe(false);
});

it('shows existing partial attempts without offering a second create or requiring enabled setup', async () => {
  mocks.fetchMetaCampaignCreation.mockResolvedValue({ ...result, status: 'needs_attention', ad_id: null, error: 'Meta request failed.' });
  render(<MarketingMetaCreation draft={draft} products={[product]} />);
  expect(await screen.findByText('Meta request failed.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Confirm and create paused campaign' })).toBeNull();
  expect(mocks.fetchMetaCreationSetup).not.toHaveBeenCalled();
  expect(mocks.createPausedMetaCampaign).not.toHaveBeenCalled();
});

it('shows configuration errors and requires a status refresh after uncertain network results', async () => {
  mocks.createPausedMetaCampaign.mockRejectedValue(new Error('Connection interrupted.'));
  render(<MarketingMetaCreation draft={draft} products={[product]} />);
  const submit = await screen.findByRole('button', { name: 'Confirm and create paused campaign' });
  fireEvent.change(screen.getByLabelText('Published product image for this ad'), { target: { value: product.id } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(submit);
  expect(await screen.findByText('Connection interrupted.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Confirm and create paused campaign' })).toBeNull();
  mocks.fetchMetaCampaignCreation.mockResolvedValue({ ...result, status: 'creating', ad_id: null });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Meta creation status' }));
  await screen.findByText(/Creation is incomplete or needs attention/);
  expect(mocks.createPausedMetaCampaign).toHaveBeenCalledTimes(1);
});

it('does not silently downgrade sales campaigns when no Purchase pixel is configured', async () => {
  render(<MarketingMetaCreation draft={{ ...draft, proposal: { ...draft.proposal, goal: 'sales' } }} products={[product]} />);
  expect(await screen.findByText('Sales ads require the operator to configure a Meta pixel that receives Purchase events.')).toBeTruthy();
  expect(screen.getByRole<HTMLFieldSetElement>('group', { name: '' }).disabled).toBe(true);
  expect(mocks.createPausedMetaCampaign).not.toHaveBeenCalled();
});

const partial = {
  ...result, status: 'needs_attention', creative_id: null, ad_id: null, recovery_started_at: null,
  error: 'Meta object request failed (HTTP 400, code 100, subcode 1885183). Check permissions and account setup in Meta.',
};
const recovery = {
  accountId: '123', pageId: '456', campaignId: '10', adsetId: '20', locationLabel: 'India',
  plan: {
    campaignName: 'Flowers', goal: 'traffic', destination: draft.proposal.landingPageUrl,
    primaryText: 'Saved selected copy', headline: 'Saved selected headline', description: 'Saved description',
    imageUrl: product.image, callToAction: 'SHOP_NOW',
    startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-08T10:00:00Z', lifetimeBudget: 350000,
  },
};

it('reviews server-saved recovery details and requires a separate cleanup and paused confirmation', async () => {
  mocks.fetchMetaCampaignCreation.mockResolvedValue(partial);
  mocks.reviewMetaCampaignRecovery.mockResolvedValue(recovery);
  mocks.recoverPausedMetaCampaign.mockResolvedValue({ ...result, recovery_started_at: '2030-01-01T09:00:00Z' });
  render(<MarketingMetaCreation draft={draft} products={[product]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review saved recovery' }));
  const submit = await screen.findByRole<HTMLButtonElement>('button', { name: 'Confirm and recover paused ad' });
  expect(submit.disabled).toBe(true);
  expect(screen.getByAltText('Saved recovery product image').getAttribute('src')).toBe(product.image);
  expect(screen.getByText('Saved selected copy', { exact: false })).toBeTruthy();
  expect(screen.getByText('Saved selected headline', { exact: false })).toBeTruthy();
  expect(screen.queryByLabelText('Published product image for this ad')).toBeNull();
  expect(mocks.recoverPausedMetaCampaign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I published the Meta app/ }));
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.recoverPausedMetaCampaign).toHaveBeenCalledWith(draft.id));
  await screen.findByText(/Created in Meta; campaign, ad set and ad were verified paused/);
  expect(mocks.createPausedMetaCampaign).not.toHaveBeenCalled();
});

it('blocks another recovery after an uncertain result and resets confirmation on refresh', async () => {
  mocks.fetchMetaCampaignCreation.mockResolvedValue(partial);
  mocks.reviewMetaCampaignRecovery.mockResolvedValue(recovery);
  mocks.recoverPausedMetaCampaign.mockRejectedValue(new Error('Recovery connection interrupted.'));
  render(<MarketingMetaCreation draft={draft} products={[product]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review saved recovery' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /I published the Meta app/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and recover paused ad' }));
  await screen.findByText('Recovery connection interrupted.');
  expect(screen.queryByRole('button', { name: 'Review saved recovery' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm and recover paused ad' })).toBeNull();
  mocks.fetchMetaCampaignCreation.mockResolvedValue({ ...partial, recovery_started_at: '2030-01-01T09:00:00Z' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Meta creation status' }));
  await waitFor(() => expect(mocks.fetchMetaCampaignCreation).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button', { name: 'Review saved recovery' })).toBeNull();
  expect(mocks.recoverPausedMetaCampaign).toHaveBeenCalledTimes(1);
});
