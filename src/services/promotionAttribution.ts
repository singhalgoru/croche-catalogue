export interface PromotionAttribution {
  promotion_id: string;
  promotion_name: string;
  creative_name: string;
  creative_slot: string;
}

const prefix = 'luvia:promotion:';
const lifetime = 24 * 60 * 60 * 1000;

export function rememberPromotion(productId: string, promotion: PromotionAttribution): void {
  try {
    sessionStorage.setItem(`${prefix}${productId}`, JSON.stringify({ ...promotion, expiresAt: Date.now() + lifetime }));
  } catch (error) {
    console.error('Unable to save product promotion attribution:', error);
  }
}

export function productPromotion(productId: string): Partial<PromotionAttribution> {
  try {
    const key = `${prefix}${productId}`;
    const stored = sessionStorage.getItem(key);
    if (!stored) return {};
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object'
      || !('expiresAt' in value) || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)
      || !('promotion_id' in value) || typeof value.promotion_id !== 'string'
      || !('promotion_name' in value) || typeof value.promotion_name !== 'string'
      || !('creative_name' in value) || typeof value.creative_name !== 'string'
      || !('creative_slot' in value) || typeof value.creative_slot !== 'string') {
      throw new Error('Invalid product promotion attribution.');
    }
    if (value.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key);
      return {};
    }
    return { promotion_id: value.promotion_id, promotion_name: value.promotion_name,
      creative_name: value.creative_name, creative_slot: value.creative_slot };
  } catch (error) {
    console.error('Unable to read product promotion attribution:', error);
    return {};
  }
}
