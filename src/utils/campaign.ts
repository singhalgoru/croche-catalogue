export interface CampaignAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  clickId?: string;
}

const STORAGE_KEY = 'luvia:campaign';

const readStoredCampaign = (): CampaignAttribution | null => {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CampaignAttribution) : null;
  } catch {
    return null;
  }
};

// Ad traffic only carries its UTM parameters on the first page view, so the
// attribution is stored for the rest of the visit.
export const captureCampaign = (): CampaignAttribution | null => {
  const params = new URLSearchParams(window.location.search);
  const attribution: CampaignAttribution = {
    source: params.get('utm_source') ?? undefined,
    medium: params.get('utm_medium') ?? undefined,
    campaign: params.get('utm_campaign') ?? undefined,
    content: params.get('utm_content') ?? undefined,
    term: params.get('utm_term') ?? undefined,
    clickId: params.get('fbclid') ?? undefined,
  };

  const hasAttribution = Object.values(attribution).some((value) => Boolean(value));
  if (!hasAttribution) return readStoredCampaign();

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
  return attribution;
};

export const getCampaign = (): CampaignAttribution | null => readStoredCampaign();

export const getCampaignParameters = (): Record<string, string> => {
  const campaign = readStoredCampaign();
  if (!campaign) return {};
  return {
    ...(campaign.source ? { campaign_source: campaign.source } : {}),
    ...(campaign.medium ? { campaign_medium: campaign.medium } : {}),
    ...(campaign.campaign ? { campaign_name: campaign.campaign } : {}),
    ...(campaign.content ? { campaign_content: campaign.content } : {}),
    ...(campaign.term ? { campaign_term: campaign.term } : {}),
  };
};

// A short, human-readable tag so enquiries arriving on WhatsApp can be traced
// back to the campaign that produced them.
export const getCampaignReference = (): string | null => {
  const campaign = readStoredCampaign();
  if (!campaign) return null;
  const parts = [campaign.source, campaign.campaign, campaign.content].filter(Boolean);
  return parts.length > 0 ? parts.join('/') : null;
};
