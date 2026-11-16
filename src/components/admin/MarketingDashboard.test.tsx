import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../services/products', () => ({ fetchManagedProducts: vi.fn().mockResolvedValue([]) }));

const {
  fetchMarketingOverview,
  startMetaConnection,
  completeMetaConnection,
  listMarketingCampaignDrafts,
  generateMarketingCampaignProposal,
  saveMarketingCampaignDraft,
  reviewMarketingCampaignDraft,
} = vi.hoisted(() => ({
  fetchMarketingOverview: vi.fn(),
  startMetaConnection: vi.fn(),
  completeMetaConnection: vi.fn(),
  listMarketingCampaignDrafts: vi.fn().mockResolvedValue([]),
  generateMarketingCampaignProposal: vi.fn(),
  saveMarketingCampaignDraft: vi.fn(),
  reviewMarketingCampaignDraft: vi.fn(),
}));
vi.mock('../../services/marketing', () => ({
  fetchMarketingOverview,
  startMetaConnection,
  completeMetaConnection,
  listMarketingCampaignDrafts,
  generateMarketingCampaignProposal,
  saveMarketingCampaignDraft,
  reviewMarketingCampaignDraft,
}));

import MarketingDashboard from './MarketingDashboard';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const overview = {
  account: { id: 'act_123', name: 'Luvia Creations', currency: 'INR', timezoneName: 'Asia/Kolkata', status: 1 },
  metrics: { impressions: 1200, reach: 980, linkClicks: 42, spend: 500, ctr: 3.5, cpc: 11.9, cpm: 416.67 },
  campaigns: [{ id: 'campaign-1', name: 'Winter launch', objective: 'OUTCOME_SALES', status: 'PAUSED', effectiveStatus: 'PAUSED' }],
};

it('shows read-only account, delivery and campaign data', async () => {
  fetchMarketingOverview.mockResolvedValue(overview);
  render(<MarketingDashboard />);
  expect(await screen.findByText('Winter launch')).toBeTruthy();
  expect(screen.getByText('Spend · 30 days')).toBeTruthy();
  expect(screen.getByText('Meta-reported delivery metrics are not confirmed website orders. No campaign changes can be made from this screen.')).toBeTruthy();
});

it('shows configuration errors and allows retrying', async () => {
  fetchMarketingOverview.mockRejectedValueOnce(new Error('Meta integration is not configured.'));
  fetchMarketingOverview.mockResolvedValueOnce(overview);
  render(<MarketingDashboard />);
  expect((await screen.findByRole('alert')).textContent).toContain('Meta integration is not configured.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Meta data' }));
  await waitFor(() => expect(screen.getByText('Winter launch')).toBeTruthy());
});

it('accepts only the matching popup callback and refreshes after reconnecting', async () => {
  fetchMarketingOverview.mockResolvedValue(overview);
  startMetaConnection.mockResolvedValue({ url: 'https://www.facebook.com/login', state: 'expected' });
  completeMetaConnection.mockResolvedValue(undefined);
  const popup = { location: { href: '' }, closed: false, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  render(<MarketingDashboard />);
  await screen.findByText('Winter launch');
  fireEvent.click(screen.getByRole('button', { name: 'Connect / reconnect Meta' }));
  await waitFor(() => expect(popup.location.href).toBe('https://www.facebook.com/login'));
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://evil.example', source: popup as unknown as Window,
    data: { type: 'meta-oauth-callback', state: 'expected', code: 'code' },
  }));
  expect(completeMetaConnection).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin, source: popup as unknown as Window,
    data: { type: 'meta-oauth-callback', state: 'expected', code: 'code' },
  }));
  await waitFor(() => expect(completeMetaConnection).toHaveBeenCalledWith('code', 'expected'));
  expect(await screen.findByText('Meta connected successfully.')).toBeTruthy();
  expect(fetchMarketingOverview).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});

it('rejects a callback with a different login state', async () => {
  fetchMarketingOverview.mockResolvedValue(overview);
  startMetaConnection.mockResolvedValue({ url: 'https://www.facebook.com/login', state: 'expected' });
  const popup = { location: { href: '' }, closed: false, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  render(<MarketingDashboard />);
  await screen.findByText('Winter launch');
  fireEvent.click(screen.getByRole('button', { name: 'Connect / reconnect Meta' }));
  await waitFor(() => expect(popup.location.href).toBe('https://www.facebook.com/login'));
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin, source: popup as unknown as Window,
    data: { type: 'meta-oauth-callback', state: 'wrong', code: 'code' },
  }));
  expect((await screen.findByRole('alert')).textContent).toContain('could not be verified');
  expect(completeMetaConnection).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
