import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billableWeightGrams, fetchRateQuote, parseServiceability, readShiprocketConfig } from './shiprocket';

const config = {
  email: 'api@example.test', password: 'test-placeholder', pickupPin: '400001',
  itemWeightGrams: 150, packageWeightGrams: 100,
};
const courierResponse = (couriers: unknown[]) =>
  new Response(JSON.stringify({ status: 200, data: { available_courier_companies: couriers } }));

describe('readShiprocketConfig', () => {
  it('stays disabled until credentials and a valid pickup PIN are configured', () => {
    expect(readShiprocketConfig(() => undefined)).toBeNull();
    expect(readShiprocketConfig((name) => ({ SHIPROCKET_EMAIL: 'a@b.c', SHIPROCKET_PASSWORD: 'x', SHIPROCKET_PICKUP_PINCODE: '12' })[name])).toBeNull();
  });
  it('applies default and custom parcel weights', () => {
    const env = { SHIPROCKET_EMAIL: 'a@b.c', SHIPROCKET_PASSWORD: 'x', SHIPROCKET_PICKUP_PINCODE: '400001' } as Record<string, string>;
    expect(readShiprocketConfig((name) => env[name])).toMatchObject({ itemWeightGrams: 150, packageWeightGrams: 100 });
    env.SHIPROCKET_ITEM_WEIGHT_GRAMS = '80';
    env.SHIPROCKET_PACKAGE_WEIGHT_GRAMS = 'oops';
    expect(readShiprocketConfig((name) => env[name])).toMatchObject({ itemWeightGrams: 80, packageWeightGrams: 100 });
  });
});

describe('billableWeightGrams', () => {
  it('bills at least half a kilo and rounds up to 100 g steps', () => {
    expect(billableWeightGrams(1, config)).toBe(500);
    expect(billableWeightGrams(3, config)).toBe(600);
    expect(billableWeightGrams(4, config)).toBe(700);
  });
});

describe('parseServiceability', () => {
  it('quotes the cheapest three couriers and their delivery days', () => {
    expect(parseServiceability({ data: { available_courier_companies: [
      { rate: 210.4, estimated_delivery_days: '2' },
      { rate: '64.2', estimated_delivery_days: '5' },
      { rate: 80, estimated_delivery_days: '4' },
      { rate: 95, estimated_delivery_days: '3' },
      { rate: 0 },
    ] } }, 500)).toEqual({
      provider: 'shiprocket', currency: 'INR', minCharge: 65, maxCharge: 95, minDays: 3, maxDays: 5, weightGrams: 500,
    });
  });
  it('treats routes without couriers as unserviceable', () => {
    expect(parseServiceability({ data: { available_courier_companies: [] } }, 500)).toBeNull();
    expect(parseServiceability({ status: 404, message: 'No courier' }, 500)).toBeNull();
  });
  it('rejects malformed payloads', () => {
    expect(() => parseServiceability(null, 500)).toThrow('invalid response');
    expect(() => parseServiceability({ data: {} }, 500)).toThrow('invalid response');
  });
});

describe('fetchRateQuote', () => {
  const fetchMock = vi.fn();
  const tokens = { read: vi.fn(), write: vi.fn() };
  beforeEach(() => {
    fetchMock.mockReset();
    tokens.read.mockReset();
    tokens.write.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('reuses a cached token and sends a prepaid weight query', async () => {
    tokens.read.mockResolvedValue('cached-token');
    fetchMock.mockResolvedValue(courierResponse([{ rate: 70, estimated_delivery_days: 4 }]));
    await expect(fetchRateQuote(config, tokens, '110001', 600)).resolves.toMatchObject({ minCharge: 70, minDays: 4 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=400001&delivery_postcode=110001&weight=0.6&cod=0');
    expect(init.headers.Authorization).toBe('Bearer cached-token');
    expect(tokens.write).not.toHaveBeenCalled();
  });

  it('logs in when no token is cached and again after a rejected token', async () => {
    tokens.read.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'first' })))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'second' })))
      .mockResolvedValueOnce(courierResponse([{ rate: 70 }]));
    await expect(fetchRateQuote(config, tokens, '110001', 500)).resolves.toMatchObject({ minCharge: 70, minDays: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: config.email, password: config.password });
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer second');
    expect(tokens.write).toHaveBeenCalledTimes(2);
  });

  it('returns null for unserviceable routes and throws on outages', async () => {
    tokens.read.mockResolvedValue('cached-token');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(fetchRateQuote(config, tokens, '110001', 500)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(fetchRateQuote(config, tokens, '110001', 500)).rejects.toThrow('HTTP 500');
  });
});
