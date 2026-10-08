import { afterEach, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getProductShareDetails } from './productShare';
import { captureCampaign, getCampaignParameters } from './campaign';

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

const product: Product = {
  id: 'product-1', publicSlug: 'rose', name: 'Rose', category: 'Flowers',
  description: 'Cotton flower', price: 100, color: 'Red', inStock: true, image: '/rose.jpg',
  variants: [{
    id: 'variant-1', publicSlug: 'pink', name: 'Pink', color: 'Pink', price: null,
    inStock: true, availableQuantity: 3, image: '/pink.jpg', imagePath: 'pink.jpg', gallery: [],
  }],
};

it('tags Reddit links without changing links shared to other channels or losing variants', () => {
  const details = getProductShareDetails(product, product.variants[0]);
  const tracked = new URL(details.redditProductUrl);
  expect(tracked.searchParams.get('variant')).toBe('pink');
  expect(tracked.searchParams.get('utm_source')).toBe('reddit');
  expect(tracked.searchParams.get('utm_medium')).toBe('social');
  expect(tracked.searchParams.get('utm_campaign')).toBe('product_share');
  expect(tracked.searchParams.get('utm_content')).toBe('rose');
  expect(new URL(details.redditUrl).searchParams.get('url')).toBe(details.redditProductUrl);
  expect(details.url).not.toContain('utm_');
  expect(details.whatsappUrl).not.toContain('utm_');
  expect(details.facebookUrl).not.toContain('utm_');
});

it('attributes Reddit visits and subsequent page activity using existing campaign tracking', () => {
  const details = getProductShareDetails({ ...product, publicSlug: undefined });
  const tracked = new URL(details.redditProductUrl);
  window.history.replaceState(null, '', `${tracked.pathname}${tracked.search}`);
  captureCampaign();
  window.history.replaceState(null, '', '/');
  expect(getCampaignParameters()).toEqual({
    campaign_source: 'reddit', campaign_medium: 'social',
    campaign_name: 'product_share', campaign_content: 'product-1',
  });
});
