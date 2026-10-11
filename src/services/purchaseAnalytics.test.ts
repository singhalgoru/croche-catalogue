import { beforeEach, expect, it, vi } from 'vitest';
const { rpc, ga, meta, canGA, canMeta } = vi.hoisted(() => ({
  rpc: vi.fn(), ga: vi.fn(), meta: vi.fn(), canGA: vi.fn(), canMeta: vi.fn(),
}));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc }) }));
vi.mock('./analytics', () => ({ canTrackAnalytics: canGA, trackEvent: ga }));
vi.mock('./meta', () => ({ canTrackMeta: canMeta, trackMetaEvent: meta }));

const purchase = {
  transaction_id: 'LUV-PAID', currency: 'INR', value: 900, shipping: 100, total: 1000,
  items: [{ item_id: 'rose', item_name: 'Rose', item_variant: 'Pink', variant_id: 'pink', price: 250, quantity: 4 }],
};
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  canGA.mockReturnValue(true); canMeta.mockReturnValue(true);
  ga.mockReturnValue(true); meta.mockReturnValue(true);
  rpc.mockResolvedValue({ data: purchase, error: null });
});
it('uses the paid server snapshot, excluding shipping from GA revenue and including it in Meta', async () => {
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  await trackVerifiedPurchase('owned-request');
  expect(rpc).toHaveBeenCalledWith('get_live_purchase_analytics', { request_id: 'owned-request' });
  expect(ga).toHaveBeenCalledExactlyOnceWith('purchase', { transaction_id: 'LUV-PAID', currency: 'INR',
    value: 900, shipping: 100, items: [{ ...purchase.items[0], price: 225, discount: 25 }] });
  expect(meta).toHaveBeenCalledWith('Purchase', expect.objectContaining({
    currency: 'INR', value: 1000, num_items: 4,
  }), 'purchase-LUV-PAID');
});
it('deduplicates concurrent callbacks, polling and page refresh independently for each channel', async () => {
  let service = await import('./purchaseAnalytics');
  await Promise.all([service.trackVerifiedPurchase('same'), service.trackVerifiedPurchase('same')]);
  expect(rpc).toHaveBeenCalledTimes(1);
  await service.trackVerifiedPurchase('same');
  vi.resetModules();
  service = await import('./purchaseAnalytics');
  await service.trackVerifiedPurchase('same');
  expect(ga).toHaveBeenCalledTimes(1); expect(meta).toHaveBeenCalledTimes(1);
});
it('does not emit events for unpaid, inaccessible or test order snapshots', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  await trackVerifiedPurchase('not-paid');
  expect(ga).not.toHaveBeenCalled(); expect(meta).not.toHaveBeenCalled();
});
it('logs failed or malformed snapshots and permits a later retry without breaking confirmation', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  for (const data of [{}, { ...purchase, total: 999 }, { ...purchase, items: [{ ...purchase.items[0], quantity: 0 }] }]) {
    rpc.mockResolvedValue({ data, error: null });
    await trackVerifiedPurchase('retry');
  }
  rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
  await trackVerifiedPurchase('retry');
  expect(log).toHaveBeenCalledTimes(4);
  expect(ga).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: purchase, error: null });
  await trackVerifiedPurchase('retry');
  expect(ga).toHaveBeenCalledTimes(1);
  log.mockRestore();
});
it('does not persist a channel that was suppressed and excludes unexpected private fields', async () => {
  meta.mockReturnValue(false);
  rpc.mockResolvedValue({ data: { ...purchase, email: 'private@example.test',
    items: [{ ...purchase.items[0], phone: '9876543210' }] }, error: null });
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  await trackVerifiedPurchase('request');
  meta.mockReturnValue(true);
  await trackVerifiedPurchase('request');
  expect(ga).toHaveBeenCalledTimes(1); expect(meta).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([ga.mock.calls, meta.mock.calls])).not.toContain('private@example.test');
  expect(JSON.stringify([ga.mock.calls, meta.mock.calls])).not.toContain('9876543210');
});
it('avoids querying orders when both analytics providers are disabled', async () => {
  canGA.mockReturnValue(false); canMeta.mockReturnValue(false);
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  await trackVerifiedPurchase('request');
  expect(rpc).not.toHaveBeenCalled();
});

it('logs unavailable storage while preserving same-page deduplication', async () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { trackVerifiedPurchase } = await import('./purchaseAnalytics');
  await trackVerifiedPurchase('request');
  await trackVerifiedPurchase('request');
  expect(ga).toHaveBeenCalledTimes(1); expect(meta).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalled();
  get.mockRestore(); set.mockRestore(); log.mockRestore();
});
