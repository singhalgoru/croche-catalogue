import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { productPromotion, rememberPromotion } from './promotionAttribution';

const promotion = { promotion_id: 'shop_the_look:Decor', promotion_name: 'Shop this look: Decor',
  creative_name: 'category_hotspot_image', creative_slot: 'hotspot_1' };
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('isolates products and uses the latest clicked promotion without leaking storage metadata', () => {
  rememberPromotion('rose', promotion);
  expect(productPromotion('rose')).toEqual(promotion);
  expect(productPromotion('other')).toEqual({});
  const latest = { ...promotion, promotion_name: 'Shop this look: Gifts' };
  rememberPromotion('rose', latest);
  expect(productPromotion('rose')).toEqual(latest);
});

it('expires promotion attribution at exactly 24 hours', () => {
  rememberPromotion('rose', promotion);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
  expect(productPromotion('rose')).toEqual(promotion);
  vi.advanceTimersByTime(1);
  expect(productPromotion('rose')).toEqual({});
  expect(sessionStorage.getItem('luvia:promotion:rose')).toBeNull();
});

it('logs malformed or unavailable storage without breaking shopping', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.setItem('luvia:promotion:rose', '{"promotion_name":"bad"}');
  expect(productPromotion('rose')).toEqual({});
  expect(log).toHaveBeenCalledTimes(1);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  rememberPromotion('rose', promotion);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  expect(productPromotion('rose')).toEqual({});
  expect(log).toHaveBeenCalledTimes(3);
});
