import { beforeEach, expect, it, vi } from 'vitest';

const { get, construct } = vi.hoisted(() => ({ get: vi.fn(), construct: vi.fn() }));
vi.mock('npm:mmdb-lib@3.0.3', () => ({
  Reader: class {
    metadata = { databaseType: 'GeoLite2-City' };
    constructor(buffer: unknown) { construct(buffer); }
    get = get;
  },
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

it('keeps only approximate place names, never coordinates', async () => {
  const { parseLocation } = await import('./geolocation');
  expect(parseLocation(null)).toBeNull();
  expect(parseLocation({})).toBeNull();
  expect(parseLocation({
    city: { names: { en: 'Meerut' } }, subdivisions: [{ names: { en: 'Uttar Pradesh' } }],
    country: { names: { en: 'India' }, iso_code: 'IN' }, location: { latitude: 1, longitude: 2 },
  })).toEqual({ city: 'Meerut', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', provider: 'geolite2' });
});
it('downloads once and shares the reader across lookups', async () => {
  const { lookupLocation } = await import('./geolocation');
  get.mockReturnValue({ country: { iso_code: 'IN' } });
  const download = vi.fn(async () => new Blob(['test-mmdb']));
  await lookupLocation('203.0.113.9', download);
  await lookupLocation('2001:db8::1', download);
  expect(download).toHaveBeenCalledTimes(1);
  expect(construct).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('2001:db8::1');
});
it('retries failed database downloads instead of caching a failure', async () => {
  const { lookupLocation } = await import('./geolocation');
  const download = vi.fn().mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce(new Blob(['test-mmdb']));
  await expect(lookupLocation('203.0.113.9', download)).rejects.toThrow('Unavailable');
  get.mockReturnValue(null);
  await expect(lookupLocation('203.0.113.9', download)).resolves.toBeNull();
  expect(download).toHaveBeenCalledTimes(2);
});
