export interface MetaConfig {
  accessToken: string;
  accountId: string;
  graphApiVersion: string;
}

export interface MetaLocation {
  key: string;
  type: 'region' | 'city' | 'zip';
  label: string;
}

export interface MetaOverview {
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

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const ACCOUNT_ID = /^(?:act_)?([0-9]{1,30})$/i;
const GRAPH_API_VERSION = /^v[0-9]{1,3}\.[0-9]{1,2}$/;
const MAX_CAMPAIGN_PAGES = 20;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Meta returned an invalid ${field}.`);
  return value;
};

const metric = (value: unknown, field: string, integer = false): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error(`Meta returned an invalid ${field}.`);
  }
  return parsed;
};
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function readMetaConfig(getEnv: (name: string) => string | undefined): MetaConfig {
  const accessToken = getEnv('META_ACCESS_TOKEN')?.trim();
  const configuredAccountId = getEnv('META_AD_ACCOUNT_ID')?.trim();
  const graphApiVersion = getEnv('META_GRAPH_API_VERSION')?.trim();
  if (!accessToken || !configuredAccountId || !graphApiVersion) {
    throw new Error('Meta read access is not configured. Set META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, and META_GRAPH_API_VERSION as Supabase function secrets.');
  }
  const accountMatch = configuredAccountId.match(ACCOUNT_ID);
  if (!accountMatch) throw new Error('META_AD_ACCOUNT_ID must be a numeric Meta ad account ID, optionally prefixed with act_.');
  if (!GRAPH_API_VERSION.test(graphApiVersion)) throw new Error('META_GRAPH_API_VERSION must use the format vNN.N.');
  return { accessToken, accountId: accountMatch[1], graphApiVersion };
}

async function graphRequest<T>(
  config: MetaConfig,
  path: string,
  parameters: Record<string, string>,
  fetcher: Fetcher,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${path}`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Unable to connect to the Meta Marketing API.');
  }
  if (!response.ok) throw new Error(`Meta Marketing API request failed with status ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Meta Marketing API returned invalid JSON.');
  }
  return payload as T;
}

function parseAccount(value: unknown): MetaOverview['account'] {
  if (!isRecord(value) || typeof value.account_status !== 'number' || !Number.isSafeInteger(value.account_status)) {
    throw new Error('Meta returned an invalid ad account response.');
  }
  const currency = requiredText(value.currency, 'account currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Meta returned an invalid account currency.');
  return {
    id: requiredText(value.id, 'account ID'),
    name: requiredText(value.name, 'account name'),
    currency,
    timezoneName: requiredText(value.timezone_name, 'account timezone'),
    status: value.account_status,
  };
}

function parseCampaign(value: unknown): MetaOverview['campaigns'][number] {
  if (!isRecord(value)) throw new Error('Meta returned an invalid campaign response.');
  return {
    id: requiredText(value.id, 'campaign ID'),
    name: requiredText(value.name, 'campaign name'),
    objective: requiredText(value.objective, 'campaign objective'),
    status: requiredText(value.status, 'campaign status'),
    effectiveStatus: requiredText(value.effective_status, 'campaign delivery status'),
  };
}

function parseMetrics(value: unknown): MetaOverview['metrics'] {
  if (!Array.isArray(value)) throw new Error('Meta returned invalid account insights.');
  if (value.length > 1 || (value.length === 1 && !isRecord(value[0]))) {
    throw new Error('Meta returned an unexpected account insights response.');
  }
  const row = value[0] as JsonRecord | undefined;
  const impressions = metric(row?.impressions ?? 0, 'impressions', true);
  const reach = metric(row?.reach ?? 0, 'reach', true);
  const linkClicks = metric(row?.inline_link_clicks ?? 0, 'link clicks', true);
  const spend = metric(row?.spend ?? 0, 'spend');
  return {
    impressions,
    reach,
    linkClicks,
    spend,
    ctr: impressions ? rounded(linkClicks / impressions * 100) : 0,
    cpc: linkClicks ? rounded(spend / linkClicks) : 0,
    cpm: impressions ? rounded(spend / impressions * 1000) : 0,
  };
}

export async function fetchMetaOverview(config: MetaConfig, fetcher: Fetcher = fetch): Promise<MetaOverview> {
  const accountPath = `act_${config.accountId}`;
  const account = parseAccount(await graphRequest<JsonRecord>(config, accountPath, {
    fields: 'id,name,currency,timezone_name,account_status',
  }, fetcher));

  const campaigns: MetaOverview['campaigns'] = [];
  let after: string | undefined;
  const seenCursors = new Set<string>();
  let complete = false;
  for (let page = 0; page < MAX_CAMPAIGN_PAGES; page += 1) {
    const parameters: Record<string, string> = {
      fields: 'id,name,objective,status,effective_status',
      limit: '100',
    };
    if (after) parameters.after = after;
    const result = await graphRequest<JsonRecord>(config, `${accountPath}/campaigns`, parameters, fetcher);
    if (!Array.isArray(result.data)) throw new Error('Meta returned an invalid campaigns response.');
    campaigns.push(...result.data.map(parseCampaign));
    if (!isRecord(result.paging) || !result.paging.next) {
      complete = true;
      break;
    }
    if (!isRecord(result.paging.cursors) || typeof result.paging.cursors.after !== 'string'
      || !result.paging.cursors.after || seenCursors.has(result.paging.cursors.after)) {
      throw new Error('Meta returned invalid campaign pagination data.');
    }
    after = result.paging.cursors.after;
    seenCursors.add(after);
  }
  if (!complete) throw new Error('Meta returned more campaign pages than the read limit allows.');

  const insights = await graphRequest<JsonRecord>(config, `${accountPath}/insights`, {
    fields: 'impressions,reach,inline_link_clicks,spend',
    date_preset: 'last_30d',
  }, fetcher);
  return { account, metrics: parseMetrics(insights.data), campaigns };
}

export async function searchMetaLocations(
  config: MetaConfig,
  query: string,
  locationType: MetaLocation['type'],
  fetcher: Fetcher = fetch,
): Promise<MetaLocation[]> {
  const result = await graphRequest<JsonRecord>(config, 'search', {
    type: 'adgeolocation',
    location_types: JSON.stringify([locationType]),
    country_code: 'IN',
    q: query,
    limit: '20',
  }, fetcher);
  if (!isRecord(result) || !Array.isArray(result.data)) throw new Error('Meta returned invalid location results.');
  const locations: MetaLocation[] = [];
  for (const row of result.data) {
    if (!isRecord(row)) throw new Error('Meta returned an invalid location.');
    if (row.country_code !== 'IN' || row.type !== locationType) continue;
    const key = requiredText(row.key, 'location key');
    const name = requiredText(row.name, 'location name');
    if (row.region !== undefined && typeof row.region !== 'string') {
      throw new Error('Meta returned an invalid location region.');
    }
    const label = [...new Set([name, row.region, 'India'].filter((part): part is string => Boolean(part)))].join(', ');
    if (key.length > 100 || label.length > 250) throw new Error('Meta returned an invalid location.');
    if (!locations.some(location => location.key === key)) locations.push({ key, type: locationType, label });
  }
  return locations;
}
