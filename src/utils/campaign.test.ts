import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureCampaign, getCampaignParameters, getCampaignReference } from './campaign';

const setLocation = (search: string) => {
  window.history.replaceState(null, '', `/${search}`);
};

describe('campaign attribution', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('builds a WhatsApp reference from an ad campaign', () => {
    setLocation('?utm_source=meta&utm_campaign=diwali');
    captureCampaign();

    expect(getCampaignReference()).toBe('meta/diwali');
    expect(getCampaignParameters()).toEqual({
      campaign_source: 'meta',
      campaign_name: 'diwali',
    });
  });

  it('keeps the installed PWA source out of the WhatsApp reference but still reports it to GA', () => {
    // The PWA's start_url carries utm_source=pwa&utm_medium=app purely for GA
    // attribution; it must never be appended to a customer-facing message.
    setLocation('?utm_source=pwa&utm_medium=app');
    captureCampaign();

    expect(getCampaignReference()).toBeNull();
    expect(getCampaignParameters()).toEqual({
      campaign_source: 'pwa',
      campaign_medium: 'app',
    });
  });

  it('returns no reference when no campaign has ever been captured', () => {
    expect(getCampaignReference()).toBeNull();
    expect(getCampaignParameters()).toEqual({});
  });
});
