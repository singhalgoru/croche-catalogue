import { expect, it, vi } from 'vitest';
import { fetchMetaOverview, readMetaConfig } from './meta';

const config = { accessToken: 'top-secret-fixture', accountId: '12345', graphApiVersion: 'v99.0' };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

it('requires explicit server-side credentials and validates the account ID and API version', () => {
  expect(() => readMetaConfig(() => undefined)).toThrow('Meta read access is not configured.');
  expect(() => readMetaConfig(name => ({
    META_ACCESS_TOKEN: 'token', META_AD_ACCOUNT_ID: 'not-an-id', META_GRAPH_API_VERSION: 'v99.0',
  }[name]))).toThrow('META_AD_ACCOUNT_ID must be a numeric Meta ad account ID');
  expect(() => readMetaConfig(name => ({
    META_ACCESS_TOKEN: 'token', META_AD_ACCOUNT_ID: 'act_123', META_GRAPH_API_VERSION: '99',
  }[name]))).toThrow('META_GRAPH_API_VERSION must use the format');
  expect(readMetaConfig(name => ({
    META_ACCESS_TOKEN: ' token ', META_AD_ACCOUNT_ID: 'act_123', META_GRAPH_API_VERSION: 'v99.0',
  }[name]))).toEqual({ accessToken: 'token', accountId: '123', graphApiVersion: 'v99.0' });
});

it('reads account details, paginated campaigns and 30-day link-click metrics without putting the token in URLs', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({
      id: 'act_12345', name: 'Luvia', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1,
    }))
    .mockResolvedValueOnce(response({
      data: [{ id: 'c1', name: 'First', objective: 'OUTCOME_SALES', status: 'PAUSED', effective_status: 'PAUSED' }],
      paging: { next: 'present', cursors: { after: 'cursor-1' } },
    }))
    .mockResolvedValueOnce(response({
      data: [{ id: 'c2', name: 'Second', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE' }],
    }))
    .mockResolvedValueOnce(response({ data: [{ impressions: '200', reach: '180', inline_link_clicks: '10', spend: '50.25' }] }));

  await expect(fetchMetaOverview(config, fetcher)).resolves.toEqual({
    account: { id: 'act_12345', name: 'Luvia', currency: 'INR', timezoneName: 'Asia/Kolkata', status: 1 },
    metrics: { impressions: 200, reach: 180, linkClicks: 10, spend: 50.25, ctr: 5, cpc: 5.03, cpm: 251.25 },
    campaigns: [
      { id: 'c1', name: 'First', objective: 'OUTCOME_SALES', status: 'PAUSED', effectiveStatus: 'PAUSED' },
      { id: 'c2', name: 'Second', objective: 'OUTCOME_SALES', status: 'ACTIVE', effectiveStatus: 'ACTIVE' },
    ],
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
  const firstCall = fetcher.mock.calls[0];
  expect(String(firstCall[0])).not.toContain(config.accessToken);
  expect(firstCall[1].headers).toEqual({ Authorization: `Bearer ${config.accessToken}` });
  expect(String(fetcher.mock.calls[2][0])).toContain('after=cursor-1');
  expect(String(fetcher.mock.calls[3][0])).toContain('date_preset=last_30d');
});

it('returns zero delivery metrics for an empty insights period and rejects invalid Meta responses safely', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({
      id: 'act_12345', name: 'Luvia', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1,
    }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: [] }));
  const result = await fetchMetaOverview(config, fetcher);
  expect(result.metrics).toEqual({ impressions: 0, reach: 0, linkClicks: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0 });

  const denied = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: config.accessToken } }), { status: 400 }));
  await expect(fetchMetaOverview(config, denied)).rejects.toThrow('Meta Marketing API request failed with status 400.');
});
