export interface PostalLocation {
  districts: string[];
  cities: string[];
  states: string[];
  country: 'India';
  provider: 'shiprocket';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const postalText = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) {
    throw new Error('Postal lookup returned incomplete location data. Please retry.');
  }
  return value.trim();
};

export const parsePostalResponse = (value: unknown, pin: string): PostalLocation | null => {
  if (!isRecord(value)) {
    throw new Error('Postal lookup returned an invalid response. Please retry.');
  }
  if (value.code === 403 && value.message === `City/State not found for this pincode : ${pin}`) return null;
  if (value.success !== true || !isRecord(value.postcode_details)) {
    throw new Error('Postal lookup is unavailable. Please retry.');
  }
  const details = value.postcode_details;
  if (details.postcode !== pin || details.country !== 'India') {
    throw new Error('Postal lookup returned mismatched location data. Please retry.');
  }
  return {
    districts: [], cities: [postalText(details.city)], states: [postalText(details.state)],
    country: 'India', provider: 'shiprocket',
  };
};
