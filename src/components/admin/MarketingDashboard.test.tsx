import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { fetchMarketingOverview } = vi.hoisted(() => ({ fetchMarketingOverview: vi.fn() }));
vi.mock('../../services/marketing', () => ({ fetchMarketingOverview }));

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
