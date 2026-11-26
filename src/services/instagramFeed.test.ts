import { beforeEach, expect, it, vi } from 'vitest';
import { fetchInstagramFeed } from './instagramFeed';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ functions: { invoke: mocks.invoke } }),
}));

beforeEach(() => mocks.invoke.mockReset());

it('invokes the public feed function and validates its response', async () => {
  const fetchedAt = new Date().toISOString();
  mocks.invoke.mockResolvedValue({
    data: { username: 'luvia', posts: [], fetchedAt, stale: false },
    error: null,
  });
  await expect(fetchInstagramFeed()).resolves.toEqual({ username: 'luvia', posts: [], fetchedAt, stale: false });
  expect(mocks.invoke).toHaveBeenCalledWith('instagram-feed', { body: {} });
});

it('surfaces invocation errors and rejects malformed feed data', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'function unavailable' } });
  await expect(fetchInstagramFeed()).rejects.toThrow('function unavailable');
  mocks.invoke.mockResolvedValue({ data: { username: 'invalid username', posts: [], fetchedAt: new Date().toISOString(), stale: false }, error: null });
  await expect(fetchInstagramFeed()).rejects.toThrow('invalid response');
});
