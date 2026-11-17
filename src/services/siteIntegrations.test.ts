import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSupabaseMock } = vi.hoisted(() => ({ loadSupabaseMock: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: loadSupabaseMock }));

import {
  fetchAdminSiteIntegrations,
  saveAdminSiteIntegrations,
  validateSiteIntegrations,
} from './siteIntegrations';

const valid = {
  whatsappNumber: ' +91 98765 43210 ',
  googleAnalyticsMeasurementId: ' g-abc123 ',
  metaPixelId: '1887798915586317',
};
const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
const client = { from: vi.fn(() => query), rpc: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockResolvedValue({
    data: {
      whatsapp_number: '919999888877',
      google_analytics_measurement_id: '',
      meta_pixel_id: '',
    },
    error: null,
  });
  client.rpc.mockResolvedValue({ data: true, error: null });
  loadSupabaseMock.mockResolvedValue(client);
});

describe('site integration settings', () => {
  it('normalizes public IDs and the international WhatsApp number', () => {
    expect(validateSiteIntegrations(valid)).toEqual({
      whatsappNumber: '919876543210',
      googleAnalyticsMeasurementId: 'G-ABC123',
      metaPixelId: '1887798915586317',
    });
  });

  it('allows analytics integrations to be disabled but requires a valid contact number', () => {
    expect(validateSiteIntegrations({
      ...valid, googleAnalyticsMeasurementId: '', metaPixelId: '',
    })).toMatchObject({ googleAnalyticsMeasurementId: '', metaPixelId: '' });
    expect(() => validateSiteIntegrations({ ...valid, whatsappNumber: '123' })).toThrow('8 to 15 digits');
  });

  it('rejects malformed tracking identifiers before saving', () => {
    expect(() => validateSiteIntegrations({ ...valid, googleAnalyticsMeasurementId: 'G/secret' }))
      .toThrow('valid GA4 measurement ID');
    expect(() => validateSiteIntegrations({ ...valid, metaPixelId: 'pixel-123' }))
      .toThrow('numeric Meta Pixel ID');
  });

  it('keeps explicitly blank saved tracking IDs disabled instead of falling back to build defaults', async () => {
    await expect(fetchAdminSiteIntegrations()).resolves.toEqual({
      whatsappNumber: '919999888877',
      googleAnalyticsMeasurementId: '',
      metaPixelId: '',
      canEdit: true,
    });
  });

  it('uses the database permission result rather than treating every admin as an editor', async () => {
    client.rpc.mockResolvedValue({ data: false, error: null });
    await expect(fetchAdminSiteIntegrations()).resolves.toMatchObject({ canEdit: false });
    expect(client.rpc).toHaveBeenCalledWith('can_update_site_integrations');
  });

  it('fails closed when the owner permission check is unavailable or malformed', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Permission check unavailable.' } });
    await expect(fetchAdminSiteIntegrations()).rejects.toThrow('Permission check unavailable.');
    client.rpc.mockResolvedValueOnce({ data: 'true', error: null });
    await expect(fetchAdminSiteIntegrations()).rejects.toThrow('invalid response');
  });

  it('saves validated integration values through the guarded admin RPC', async () => {
    await expect(saveAdminSiteIntegrations(valid)).resolves.toEqual({
      whatsappNumber: '919876543210',
      googleAnalyticsMeasurementId: 'G-ABC123',
      metaPixelId: '1887798915586317',
    });
    expect(client.rpc).toHaveBeenCalledWith('update_site_integrations', {
      p_whatsapp_number: '919876543210',
      p_google_analytics_measurement_id: 'G-ABC123',
      p_meta_pixel_id: '1887798915586317',
    });
  });
});
