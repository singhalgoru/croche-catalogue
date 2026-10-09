export interface DeliveryEstimate {
  provider: 'shiprocket';
  currency: 'INR';
  minCharge: number;
  maxCharge: number;
  minDays: number | null;
  maxDays: number | null;
  weightGrams: number;
  itemCount: number;
  checkedAt: string;
}

export type RateQuote = Omit<DeliveryEstimate, 'itemCount' | 'checkedAt'>;

export interface ShiprocketConfig {
  email: string;
  password: string;
  pickupPin: string;
  itemWeightGrams: number;
  packageWeightGrams: number;
}

interface TokenStore {
  read: () => Promise<string | null>;
  write: (token: string, expiresAt: string) => Promise<void>;
}

const API = 'https://apiv2.shiprocket.in/v1/external';
const MIN_BILLABLE_GRAMS = 500;
const WEIGHT_STEP_GRAMS = 100;
const TOKEN_LIFETIME_MS = 9 * 86400_000;
// Showing the cheapest few couriers gives a realistic range without letting
// express air options inflate the "approx" charge.
const QUOTED_COURIERS = 3;

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 50_000 ? parsed : fallback;
};

export const readShiprocketConfig = (env: (name: string) => string | undefined): ShiprocketConfig | null => {
  const email = env('SHIPROCKET_EMAIL')?.trim();
  const password = env('SHIPROCKET_PASSWORD');
  const pickupPin = env('SHIPROCKET_PICKUP_PINCODE')?.trim();
  if (!email || !password || !pickupPin || !/^[1-9][0-9]{5}$/.test(pickupPin)) return null;
  return {
    email,
    password,
    pickupPin,
    itemWeightGrams: positiveInt(env('SHIPROCKET_ITEM_WEIGHT_GRAMS'), 150),
    packageWeightGrams: positiveInt(env('SHIPROCKET_PACKAGE_WEIGHT_GRAMS'), 100),
  };
};

export const billableWeightGrams = (itemCount: number, config: Pick<ShiprocketConfig, 'itemWeightGrams' | 'packageWeightGrams'>) => {
  const actual = itemCount * config.itemWeightGrams + config.packageWeightGrams;
  return Math.max(MIN_BILLABLE_GRAMS, Math.ceil(actual / WEIGHT_STEP_GRAMS) * WEIGHT_STEP_GRAMS);
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

export const parseServiceability = (value: unknown, weightGrams: number): RateQuote | null => {
  if (!value || typeof value !== 'object') throw new Error('Shiprocket returned an invalid response.');
  const data = (value as { data?: unknown }).data;
  const couriers = data && typeof data === 'object'
    ? (data as { available_courier_companies?: unknown }).available_courier_companies
    : undefined;
  if (!Array.isArray(couriers)) {
    // Shiprocket answers unserviceable routes with a 404-style payload and no courier list.
    if ((value as { status?: unknown }).status === 404) return null;
    throw new Error('Shiprocket returned an invalid response.');
  }
  const quotes = couriers
    .map((courier) => {
      if (!courier || typeof courier !== 'object') return null;
      const record = courier as Record<string, unknown>;
      const rate = toNumber(record.rate) ?? toNumber(record.freight_charge);
      if (rate === null || rate <= 0) return null;
      const days = toNumber(record.estimated_delivery_days);
      return { rate, days: days !== null && days > 0 ? Math.round(days) : null };
    })
    .filter((quote): quote is { rate: number; days: number | null } => quote !== null)
    .sort((left, right) => left.rate - right.rate)
    .slice(0, QUOTED_COURIERS);
  if (!quotes.length) return null;
  const days = quotes.map((quote) => quote.days).filter((day): day is number => day !== null);
  return {
    provider: 'shiprocket',
    currency: 'INR',
    minCharge: Math.ceil(quotes[0].rate),
    maxCharge: Math.ceil(quotes[quotes.length - 1].rate),
    minDays: days.length ? Math.min(...days) : null,
    maxDays: days.length ? Math.max(...days) : null,
    weightGrams,
  };
};

const login = async (config: ShiprocketConfig, tokens: TokenStore) => {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Shiprocket login responded HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const token = payload && typeof payload === 'object' ? (payload as { token?: unknown }).token : undefined;
  if (typeof token !== 'string' || !token) throw new Error('Shiprocket login returned no token.');
  await tokens.write(token, new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString());
  return token;
};

export const fetchRateQuote = async (
  config: ShiprocketConfig,
  tokens: TokenStore,
  deliveryPin: string,
  weightGrams: number,
): Promise<RateQuote | null> => {
  const query = new URLSearchParams({
    pickup_postcode: config.pickupPin,
    delivery_postcode: deliveryPin,
    weight: (weightGrams / 1000).toString(),
    cod: '0',
  });
  const request = (token: string) => fetch(`${API}/courier/serviceability/?${query}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  let token = await tokens.read() ?? await login(config, tokens);
  let response = await request(token);
  if (response.status === 401) {
    token = await login(config, tokens);
    response = await request(token);
  }
  // Shiprocket answers routes with no courier using HTTP 404.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Shiprocket serviceability responded HTTP ${response.status}.`);
  return parseServiceability(await response.json(), weightGrams);
};
