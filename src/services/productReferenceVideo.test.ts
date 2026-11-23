import { beforeEach, expect, it, vi } from 'vitest';
import { fetchReferenceVideo, saveReferenceVideo } from './productReferenceVideo';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc }) }));
beforeEach(() => vi.resetAllMocks());

it('reads, saves and removes the private link with a confirmed receipt and previous value', async () => {
  rpc.mockResolvedValueOnce({ data: null });
  expect(await fetchReferenceVideo('product')).toBeNull();
  rpc.mockResolvedValueOnce({ data: 'https://youtu.be/example' });
  expect(await saveReferenceVideo('product', null, ' https://youtu.be/example ')).toBe('https://youtu.be/example');
  expect(rpc).toHaveBeenLastCalledWith('save_product_reference_video', {
    target_product: 'product', expected_url: null, new_url: 'https://youtu.be/example',
  });
  rpc.mockResolvedValueOnce({ data: 'https://youtu.be/example' });
  expect(await fetchReferenceVideo('product')).toBe('https://youtu.be/example');
  rpc.mockResolvedValueOnce({ data: null });
  expect(await saveReferenceVideo('product', 'https://youtu.be/example', null)).toBeNull();
  expect(rpc).toHaveBeenLastCalledWith('save_product_reference_video', {
    target_product: 'product', expected_url: 'https://youtu.be/example', new_url: null,
  });
});

it('rejects unsafe URLs before saving or presenting them as links', async () => {
  for (const url of ['', 'javascript:alert(1)', 'http://example.test/video', 'https://user:pass@example.test/',
    'https://example.test/with spaces', `https://example.test/${'a'.repeat(2048)}`]) {
    await expect(saveReferenceVideo('product', null, url)).rejects.toThrow();
  }
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: 'javascript:alert(1)' });
  await expect(fetchReferenceVideo('product')).rejects.toThrow('HTTPS');
});

it('surfaces access, stale-write and unconfirmed response errors', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'Verified admin access required.' } });
  await expect(fetchReferenceVideo('product')).rejects.toThrow('Verified admin');
  rpc.mockResolvedValueOnce({ error: { message: 'Reference video changed. Refresh before saving.' } });
  await expect(saveReferenceVideo('product', null, 'https://example.test/')).rejects.toThrow('changed');
  rpc.mockResolvedValueOnce({ data: 'unexpected' });
  await expect(saveReferenceVideo('product', null, 'https://example.test/')).rejects.toThrow('could not be confirmed');
});
