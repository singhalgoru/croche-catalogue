export interface PostalLocation {
  districts: string[];
  states: string[];
  country: 'India';
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
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('Postal lookup returned an invalid response. Please retry.');
  }
  const result = value[0];
  if (result.Status === 'Error' && result.PostOffice === null
    && typeof result.Message === 'string' && /^No records found$/i.test(result.Message.trim())) return null;
  if (result.Status !== 'Success' || !Array.isArray(result.PostOffice) || !result.PostOffice.length) {
    throw new Error('Postal lookup is unavailable. Please retry.');
  }
  const districts = new Set<string>();
  const states = new Set<string>();
  for (const office of result.PostOffice) {
    if (!isRecord(office) || office.Pincode !== pin || office.Country !== 'India') {
      throw new Error('Postal lookup returned mismatched location data. Please retry.');
    }
    districts.add(postalText(office.District));
    states.add(postalText(office.State));
  }
  return { districts: [...districts].sort(), states: [...states].sort(), country: 'India' };
};
