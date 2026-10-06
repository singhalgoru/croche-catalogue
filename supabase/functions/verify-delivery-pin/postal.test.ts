import { expect, it } from 'vitest';
import { parsePostalResponse } from './postal';

const office = { Pincode: '110001', Country: 'India', District: 'Central Delhi', State: 'Delhi' };
it('validates the returned PIN and deduplicates areas without claiming an exact city', () => {
  expect(parsePostalResponse([{ Status: 'Success', PostOffice: [office, office, { ...office, District: 'New Delhi' }] }], '110001'))
    .toEqual({ districts: ['Central Delhi', 'New Delhi'], states: ['Delhi'], country: 'India' });
});
it('recognizes nonexistent PINs, but never treats provider failures as a valid PIN', () => {
  expect(parsePostalResponse([{ Status: 'Error', Message: 'No records found', PostOffice: null }], '999999')).toBeNull();
  for (const payload of [null, [], [{ Status: 'Success', PostOffice: [] }], [{ Status: 'Error', Message: 'Service unavailable', PostOffice: null }],
    [{ Status: 'Success', PostOffice: [{ ...office, Pincode: '110002' }] }],
    [{ Status: 'Success', PostOffice: [{ ...office, District: null }] }]]) {
    expect(() => parsePostalResponse(payload, '110001')).toThrow();
  }
});
