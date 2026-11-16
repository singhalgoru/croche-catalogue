import { loadSupabase } from '../lib/supabaseConfig';

export interface MarketingOverview {
  account: {
    id: string;
    name: string;
    currency: string;
    timezoneName: string;
    status: number;
  };
  metrics: {
    impressions: number;
    reach: number;
    linkClicks: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  campaigns: {
    id: string;
    name: string;
    objective: string;
    status: string;
    effectiveStatus: string;
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isNonNegativeInteger = (value: unknown): value is number =>
  isNonNegativeNumber(value) && Number.isSafeInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const parseOverview = (value: unknown): MarketingOverview => {
  if (!isRecord(value) || !isRecord(value.account) || !isRecord(value.metrics) || !Array.isArray(value.campaigns)) {
    throw new Error('Invalid marketing overview response.');
  }
  const { account, metrics } = value;
  if (!isText(account.id) || !isText(account.name)
    || typeof account.currency !== 'string' || !/^[A-Z]{3}$/.test(account.currency)
    || !isText(account.timezoneName) || typeof account.status !== 'number' || !Number.isSafeInteger(account.status)) {
    throw new Error('Invalid Meta ad account response.');
  }
  if (!isNonNegativeInteger(metrics.impressions) || !isNonNegativeInteger(metrics.reach)
    || !isNonNegativeInteger(metrics.linkClicks) || !isNonNegativeNumber(metrics.spend)
    || !isNonNegativeNumber(metrics.ctr) || !isNonNegativeNumber(metrics.cpc)
    || !isNonNegativeNumber(metrics.cpm)) {
    throw new Error('Invalid Meta delivery metrics response.');
  }
  const campaigns = value.campaigns.map((campaign: unknown) => {
    if (!isRecord(campaign) || !isText(campaign.id) || !isText(campaign.name)
      || !isText(campaign.objective) || !isText(campaign.status) || !isText(campaign.effectiveStatus)) {
      throw new Error('Invalid Meta campaign response.');
    }
    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      effectiveStatus: campaign.effectiveStatus,
    };
  });
  return {
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
      timezoneName: account.timezoneName,
      status: account.status,
    },
    metrics: {
      impressions: metrics.impressions,
      reach: metrics.reach,
      linkClicks: metrics.linkClicks,
      spend: metrics.spend,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm,
    },
    campaigns,
  };
};

const errorMessage = async (error: { message: string; context?: unknown }) => {
  if (error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json();
      if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
    } catch {
      // Use the SDK error when the response is not JSON.
    }
  }
  return error.message;
};

export async function fetchMarketingOverview(): Promise<MarketingOverview> {
  const client = await loadSupabase();
  if (!client) throw new Error('Marketing data requires an online connection.');
  const { data, error } = await client.functions.invoke('marketing-read', { body: {} });
  if (error) {
    const message = await errorMessage(error);
    throw new Error(`Unable to load Meta marketing data: ${message}`);
  }
  return parseOverview(data);
}
