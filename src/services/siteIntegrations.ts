import { loadSupabase } from '../lib/supabaseConfig';

export interface SiteIntegrations {
  whatsappNumber: string;
  googleAnalyticsMeasurementId: string;
  metaPixelId: string;
}

export interface AdminSiteIntegrations extends SiteIntegrations {
  canEdit: boolean;
}

const defaults = (): SiteIntegrations => ({
  whatsappNumber: (import.meta.env.VITE_WHATSAPP_NUMBER?.trim() || '919205907350').replace(/\D/g, ''),
  googleAnalyticsMeasurementId: import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? '',
  metaPixelId: import.meta.env.VITE_META_PIXEL_ID?.trim() ?? '',
});

let current = defaults();

const parseStringSetting = (value: unknown, fallback: string, name: string) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`The saved ${name} setting is invalid.`);
  return value.trim();
};

const parseRow = (row: unknown): SiteIntegrations => {
  if (!row || typeof row !== 'object') throw new Error('Site integration settings returned an invalid response.');
  const data = row as Record<string, unknown>;
  const fallback = defaults();
  const whatsappNumber = parseStringSetting(data.whatsapp_number, fallback.whatsappNumber, 'WhatsApp number').replace(/\D/g, '');
  if (!/^[0-9]{8,15}$/.test(whatsappNumber)) throw new Error('The saved WhatsApp number is invalid.');
  return {
    whatsappNumber,
    googleAnalyticsMeasurementId: parseStringSetting(
      data.google_analytics_measurement_id, fallback.googleAnalyticsMeasurementId, 'GA4 measurement ID',
    ),
    metaPixelId: parseStringSetting(data.meta_pixel_id, fallback.metaPixelId, 'Meta Pixel ID'),
  };
};

const readSettings = async (): Promise<SiteIntegrations> => {
  const client = await loadSupabase();
  if (!client) throw new Error('Site integration settings require an online connection.');
  const { data, error } = await client.from('site_integrations')
    .select('whatsapp_number, google_analytics_measurement_id, meta_pixel_id')
    .eq('id', true)
    .single();
  if (error) throw new Error(`Unable to load site integration settings: ${error.message}`);
  return parseRow(data);
};

export const getSiteIntegrations = () => current;

export async function loadPublicSiteIntegrations(): Promise<SiteIntegrations> {
  const client = await loadSupabase();
  if (!client) return current;
  const { data, error } = await client.from('site_integrations')
    .select('whatsapp_number, google_analytics_measurement_id, meta_pixel_id')
    .eq('id', true)
    .single();
  if (error) throw new Error(`Unable to load public site integration settings: ${error.message}`);
  current = parseRow(data);
  return current;
}

export async function fetchAdminSiteIntegrations(): Promise<AdminSiteIntegrations> {
  const client = await loadSupabase();
  if (!client) throw new Error('Site integration settings require an online connection.');
  const [settings, { data, error }] = await Promise.all([
    readSettings(),
    client.rpc('can_update_site_integrations'),
  ]);
  if (error) throw new Error(`Unable to check site integration permissions: ${error.message}`);
  if (typeof data !== 'boolean') throw new Error('Site integration permissions returned an invalid response.');
  return { ...settings, canEdit: data };
}

export function validateSiteIntegrations(input: SiteIntegrations): SiteIntegrations {
  const whatsappNumber = input.whatsappNumber.replace(/\D/g, '');
  const googleAnalyticsMeasurementId = input.googleAnalyticsMeasurementId.trim().toUpperCase();
  const metaPixelId = input.metaPixelId.trim();
  if (!/^[0-9]{8,15}$/.test(whatsappNumber)) {
    throw new Error('Enter a WhatsApp number with 8 to 15 digits, including its country code.');
  }
  if (googleAnalyticsMeasurementId && !/^G-[A-Z0-9]{4,20}$/.test(googleAnalyticsMeasurementId)) {
    throw new Error('Enter a valid GA4 measurement ID such as G-XXXXXXXXXX, or leave it blank to disable GA4.');
  }
  if (metaPixelId && !/^[0-9]{5,30}$/.test(metaPixelId)) {
    throw new Error('Enter a numeric Meta Pixel ID, or leave it blank to disable Meta Pixel tracking.');
  }
  return { whatsappNumber, googleAnalyticsMeasurementId, metaPixelId };
}

export async function saveAdminSiteIntegrations(input: SiteIntegrations): Promise<SiteIntegrations> {
  const settings = validateSiteIntegrations(input);
  const client = await loadSupabase();
  if (!client) throw new Error('Saving site integration settings requires an online connection.');
  const { data, error } = await client.rpc('update_site_integrations', {
    p_whatsapp_number: settings.whatsappNumber,
    p_google_analytics_measurement_id: settings.googleAnalyticsMeasurementId,
    p_meta_pixel_id: settings.metaPixelId,
  });
  if (error) throw new Error(`Unable to save site integration settings: ${error.message}`);
  if (data !== true) throw new Error('Site integration settings returned an invalid save confirmation.');
  current = settings;
  return settings;
}
