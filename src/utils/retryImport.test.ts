import { afterEach, expect, it, vi } from 'vitest';
import { retryImport } from './retryImport';

afterEach(() => vi.restoreAllMocks());

it('recovers from a transient lazy chunk fetch failure', async () => {
  const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    .mockResolvedValue('loaded module');
  await expect(retryImport(load)).resolves.toBe('loaded module');
  expect(load).toHaveBeenCalledTimes(2);
});

it('surfaces the final import error after bounded retries', async () => {
  const failure = new TypeError('Chunk still unavailable');
  const load = vi.fn().mockRejectedValue(failure);
  await expect(retryImport(load)).rejects.toBe(failure);
  expect(load).toHaveBeenCalledTimes(3);
});

it('rejects invalid retry counts instead of returning an undefined result', async () => {
  await expect(retryImport(async () => 'module', 0)).rejects.toThrow('Import failed without an attempt.');
});
