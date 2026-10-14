import { expect, it } from 'vitest';
import { parsePostalResponse } from './postal';

const details = { postcode: '122050', country: 'India', city: 'Manesar', state: 'Haryana' };
it('reads Shiprocket city/state without treating the city as a district or storing coordinates', () => {
  expect(parsePostalResponse({ success: true, postcode_details: { ...details, latitude: '28.37', longitude: '76.91' } }, '122050'))
    .toEqual({ districts: [], cities: ['Manesar'], states: ['Haryana'], country: 'India', provider: 'shiprocket' });
});
it('recognizes only the explicit no-area response for the requested PIN', () => {
  expect(parsePostalResponse({ code: 403, message: 'City/State not found for this pincode : 999999' }, '999999')).toBeNull();
});
it.each([
  null, [], {}, { success: false }, { code: 403, message: 'Service unavailable' },
  { code: 403, message: 'City/State not found for this pincode : 999999' },
  { success: true, postcode_details: { ...details, postcode: '110001' } },
  { success: true, postcode_details: { ...details, country: 'US' } },
  { success: true, postcode_details: { ...details, city: '' } },
  { success: true, postcode_details: { ...details, state: null } },
])('rejects invalid, mismatched and unavailable responses: %j', payload => {
  expect(() => parsePostalResponse(payload, '122050')).toThrow();
});
