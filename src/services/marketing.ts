import { loadSupabase } from '../lib/supabaseConfig';

export interface MarketingOverview {
  tokenExpiresAt?: string | null;
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

export interface MarketingCampaignBrief {
  productOrOffer: string;
  goal: 'sales' | 'traffic' | 'awareness';
  landingPageUrl: string;
  targetLocation: string;
  dailyBudgetInr: number;
  durationDays: number;
}

export interface MarketingCampaignProposal extends MarketingCampaignBrief {
  campaignName: string;
  audienceSummary: string;
  creativeDirection: string;
  primaryText: string[];
  headlines: string[];
  description: string;
  callToAction: 'Shop now' | 'Learn more' | 'Send message';
  assumptions: string[];
  totalBudgetInr: number;
}

export interface SavedMarketingCampaignDraft {
  id: string;
  brief: MarketingCampaignBrief;
  proposal: MarketingCampaignProposal;
  status: 'draft' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isNonNegativeInteger = (value: unknown): value is number =>
  isNonNegativeNumber(value) && Number.isSafeInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isStringList = (value: unknown, length: number): value is string[] =>
  Array.isArray(value) && value.length === length && value.every(item => isText(item));

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
  const tokenExpiresAt = value.tokenExpiresAt;
  if (tokenExpiresAt !== undefined && tokenExpiresAt !== null
    && (typeof tokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(tokenExpiresAt)))) {
    throw new Error('Invalid Meta token expiry.');
  }
  return {
    ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
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

const parseBrief = (value: unknown): MarketingCampaignBrief => {
  if (!isRecord(value) || !isText(value.productOrOffer) || value.productOrOffer.length > 180
    || !['sales', 'traffic', 'awareness'].includes(String(value.goal))
    || typeof value.landingPageUrl !== 'string' || typeof value.targetLocation !== 'string'
    || !isText(value.targetLocation) || value.targetLocation.length > 100
    || typeof value.dailyBudgetInr !== 'number' || !Number.isSafeInteger(value.dailyBudgetInr)
    || value.dailyBudgetInr < 100 || value.dailyBudgetInr > 100_000
    || typeof value.durationDays !== 'number' || !Number.isSafeInteger(value.durationDays)
    || value.durationDays < 1 || value.durationDays > 30) {
    throw new Error('Invalid campaign brief response.');
  }
  const destination = new URL(value.landingPageUrl);
  if (destination.protocol !== 'https:' || destination.username || destination.password
    || !['luviacreations.com', 'www.luviacreations.com'].includes(destination.hostname)
    || destination.port) throw new Error('Invalid campaign destination response.');
  return {
    productOrOffer: value.productOrOffer,
    goal: value.goal as MarketingCampaignBrief['goal'],
    landingPageUrl: destination.href,
    targetLocation: value.targetLocation,
    dailyBudgetInr: value.dailyBudgetInr,
    durationDays: value.durationDays,
  };
};

const parseProposal = (value: unknown): MarketingCampaignProposal => {
  if (!isRecord(value)) throw new Error('Invalid campaign proposal response.');
  const brief = parseBrief(value);
  if (!isText(value.campaignName) || value.campaignName.length > 80
    || !isText(value.audienceSummary) || value.audienceSummary.length > 300
    || !isText(value.creativeDirection) || value.creativeDirection.length > 500
    || !isStringList(value.primaryText, 2) || value.primaryText.some(text => text.length > 500)
    || !isStringList(value.headlines, 2) || value.headlines.some(text => text.length > 60)
    || !isText(value.description) || value.description.length > 120
    || !['Shop now', 'Learn more', 'Send message'].includes(String(value.callToAction))
    || !isStringList(value.assumptions, 2) || value.assumptions.some(text => text.length > 240)
    || value.totalBudgetInr !== brief.dailyBudgetInr * brief.durationDays) {
    throw new Error('Invalid campaign proposal response.');
  }
  return {
    ...brief,
    campaignName: value.campaignName,
    audienceSummary: value.audienceSummary,
    creativeDirection: value.creativeDirection,
    primaryText: value.primaryText,
    headlines: value.headlines,
    description: value.description,
    callToAction: value.callToAction as MarketingCampaignProposal['callToAction'],
    assumptions: value.assumptions,
    totalBudgetInr: value.totalBudgetInr,
  };
};

const parseSavedDraft = (value: unknown): SavedMarketingCampaignDraft => {
  if (!isRecord(value) || !isText(value.id) || !isText(value.created_at)
    || !['draft', 'approved', 'rejected'].includes(String(value.status))
    || (value.reviewed_at !== null && typeof value.reviewed_at !== 'string')) {
    throw new Error('Invalid saved campaign draft response.');
  }
  if (!Number.isFinite(Date.parse(value.created_at))
    || (typeof value.reviewed_at === 'string' && !Number.isFinite(Date.parse(value.reviewed_at)))) {
    throw new Error('Invalid saved campaign draft timestamps.');
  }
  return {
    id: value.id,
    brief: parseBrief(value.brief),
    proposal: parseProposal(value.proposal),
    status: value.status as SavedMarketingCampaignDraft['status'],
    createdAt: value.created_at,
    reviewedAt: value.reviewed_at,
  };
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

export async function startMetaConnection(): Promise<{ url: string; state: string }> {
  const client = await loadSupabase();
  if (!client) throw new Error('Meta connection requires an online connection.');
  const { data, error } = await client.functions.invoke('marketing-connect', { body: { action: 'start' } });
  if (error) throw new Error(await errorMessage(error));
  if (!isRecord(data) || typeof data.url !== 'string' || typeof data.state !== 'string') {
    throw new Error('Invalid Meta connection response.');
  }
  const url = new URL(data.url);
  if (url.origin !== 'https://www.facebook.com' || url.username || url.password
    || !/^\/v\d{1,3}\.\d{1,2}\/dialog\/oauth$/.test(url.pathname)
    || url.searchParams.get('state') !== data.state) {
    throw new Error('Invalid Meta login URL.');
  }
  return { url: url.href, state: data.state };
}

export async function completeMetaConnection(code: string, state: string): Promise<void> {
  const client = await loadSupabase();
  if (!client) throw new Error('Meta connection requires an online connection.');
  const { error } = await client.functions.invoke('marketing-connect', { body: { action: 'complete', code, state } });
  if (error) throw new Error(await errorMessage(error));
}

export async function generateMarketingCampaignProposal(
  brief: MarketingCampaignBrief,
): Promise<MarketingCampaignProposal> {
  const client = await loadSupabase();
  if (!client) throw new Error('Campaign draft generation requires an online connection.');
  const { data, error } = await client.functions.invoke('marketing-draft', { body: brief });
  if (error) throw new Error(await errorMessage(error));
  if (!isRecord(data) || !('proposal' in data)) throw new Error('Invalid campaign generation response.');
  return parseProposal(data.proposal);
}

export async function listMarketingCampaignDrafts(): Promise<SavedMarketingCampaignDraft[]> {
  const client = await loadSupabase();
  if (!client) throw new Error('Campaign drafts require an online connection.');
  const { data, error } = await client
    .from('marketing_campaign_drafts')
    .select('id, brief, proposal, status, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Unable to load campaign drafts: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Invalid saved campaign drafts response.');
  return data.map(parseSavedDraft);
}

export async function saveMarketingCampaignDraft(
  brief: MarketingCampaignBrief,
  proposal: MarketingCampaignProposal,
): Promise<SavedMarketingCampaignDraft> {
  const validatedBrief = parseBrief(brief);
  const validatedProposal = parseProposal(proposal);
  const client = await loadSupabase();
  if (!client) throw new Error('Saving campaign drafts requires an online connection.');
  const { data, error } = await client
    .from('marketing_campaign_drafts')
    .insert({ brief: validatedBrief, proposal: validatedProposal })
    .select('id, brief, proposal, status, created_at, reviewed_at')
    .single();
  if (error) throw new Error(`Unable to save campaign draft: ${error.message}`);
  return parseSavedDraft(data);
}

export async function reviewMarketingCampaignDraft(
  id: string,
  decision: 'approved' | 'rejected',
): Promise<SavedMarketingCampaignDraft> {
  const client = await loadSupabase();
  if (!client) throw new Error('Reviewing campaign drafts requires an online connection.');
  const { data, error } = await client.rpc('review_marketing_campaign_draft', {
    target_id: id,
    decision,
  });
  if (error) throw new Error(`Unable to review campaign draft: ${error.message}`);
  return parseSavedDraft(data);
}
