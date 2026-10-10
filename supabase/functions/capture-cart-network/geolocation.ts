import { Buffer } from 'node:buffer';
import { Reader, type CityResponse } from 'npm:mmdb-lib@3.0.3';

export interface ApproximateLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  provider: 'geolite2';
}

let cached: { reader: Reader<CityResponse>; expiresAt: number } | null = null;
let loading: Promise<Reader<CityResponse>> | null = null;

export const parseLocation = (record: CityResponse | null): ApproximateLocation | null => {
  if (!record) return null;
  const city = record.city?.names?.en ?? null;
  const region = record.subdivisions?.[0]?.names?.en ?? null;
  const country = record.country?.names?.en ?? null;
  const countryCode = record.country?.iso_code ?? null;
  if (!city && !region && !country && !countryCode) return null;
  return { city, region, country, countryCode, provider: 'geolite2' };
};

export async function lookupLocation(ip: string, download: () => Promise<Blob>): Promise<ApproximateLocation | null> {
  if (!cached || cached.expiresAt <= Date.now()) {
    if (!loading) {
      loading = (async () => {
        const file = await download();
        if (!file.size || file.size > 104857600) throw new Error('GeoLite2 database is empty or exceeds 100 MB.');
        const reader = new Reader<CityResponse>(Buffer.from(await file.arrayBuffer()));
        if (reader.metadata.databaseType !== 'GeoLite2-City') {
          throw new Error('Upload a GeoLite2 City MMDB database.');
        }
        cached = { reader, expiresAt: Date.now() + 3600_000 };
        return reader;
      })();
    }
    try { await loading; } finally { loading = null; }
  }
  if (!cached) throw new Error('GeoLite2 database did not load.');
  return parseLocation(cached.reader.get(ip));
}
