import { beforeEach, expect, it, vi } from 'vitest';

const { loadSupabase, invoke } = vi.hoisted(() => ({
  loadSupabase: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase }));

import { fetchMarketingOverview } from './marketing';

const validOverview = {
  account: { id: 'act_123', name: 'Luvia', currency: 'INR', timezoneName: 'Asia/Kolkata', status: 1 },
  metrics: { impressions: 1200, reach: 980, linkClicks: 42, spend: 500, ctr: 3.5, cpc: 11.9, cpm: 416.67 },
  campaigns: [{ id: 'campaign-1', name: 'Test campaign', objective: 'OUTCOME_SALES', status: 'PAUSED', effectiveStatus: 'PAUSED' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  loadSupabase.mockResolvedValue({ functions: { invoke } });
});

it('invokes the read-only marketing function and validates its response', async () => {
  invoke.mockResolvedValue({ data: validOverview, error: null });
  await expect(fetchMarketingOverview()).resolves.toEqual(validOverview);
  expect(invoke).toHaveBeenCalledWith('marketing-read', { body: {} });
});

it('surfaces function errors and rejects malformed provider data', async () => {
  invoke.mockResolvedValueOnce({
    data: null,
    error: { message: 'Function returned an error', context: new Response('{"error":"Meta integration is not configured."}') },
  });
  await expect(fetchMarketingOverview()).rejects.toThrow('Meta integration is not configured.');
  invoke.mockResolvedValueOnce({ data: { ...validOverview, metrics: { ...validOverview.metrics, spend: '500' } }, error: null });
  await expect(fetchMarketingOverview()).rejects.toThrow('Invalid Meta delivery metrics response.');
});
