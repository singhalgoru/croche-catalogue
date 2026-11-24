import { expect, it, vi } from 'vitest';
import { createDtdcSandboxClient, dtdcBookingResult, dtdcTrackingResult, type DtdcSandboxConsignment } from './dtdcSandbox';

const address = { name: 'Test Sender', phone: '9876543210', address_line_1: 'Test Road', pincode: '110001', city: 'Delhi', state: 'Delhi' };
const consignment: DtdcSandboxConsignment = {
  customer_code: 'TEST', service_type_id: 'TEST', load_type: 'NON-DOCUMENT', consignment_type: 'Forward',
  description: 'Test parcel', commodity_id: '7', dimension_unit: 'cm', length: '10', width: '10', height: '10', weight_unit: 'kg',
  weight: '0.5', declared_value: '100', num_pieces: '1', origin_details: address, destination_details: address,
  customer_reference_number: 'test-order-1',
};

it('requires a single successful booking matching the requested customer reference', () => {
  const result = { status: 'OK', data: [{ success: true, reference_number: 'AWB123', customer_reference_number: 'test-order-1' }] };
  expect(dtdcBookingResult(result, 'test-order-1')).toBe('AWB123');
  expect(() => dtdcBookingResult(result, 'another-order')).toThrow('Check DTDC before retrying');
  expect(() => dtdcBookingResult({ ...result, data: [{ ...result.data[0], success: false }] }, 'test-order-1')).toThrow();
  expect(() => dtdcBookingResult({ ...result, data: [] }, 'test-order-1')).toThrow();
});

it('accepts tracking only for the requested consignment and leaves the status unchanged', () => {
  const result = { statusCode: 200, statusFlag: true, status: 'SUCCESS', trackHeader: { strShipmentNo: 'AWB123', strStatus: 'Returned' } };
  expect(dtdcTrackingResult(result, 'AWB123')).toBe('Returned');
  expect(() => dtdcTrackingResult(result, 'AWB456')).toThrow('mismatched');
  expect(() => dtdcTrackingResult({ ...result, statusFlag: false }, 'AWB123')).toThrow('not available');
});

it('uses only sandbox endpoints for booking, tracking and PDF labels', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: 'OK', data: [{ success: true, reference_number: 'AWB123', customer_reference_number: 'test-order-1' }] }))
    .mockResolvedValueOnce(Response.json({ statusCode: 200, statusFlag: true, status: 'SUCCESS', trackHeader: { strShipmentNo: 'AWB123', strStatus: 'Booked' } }))
    .mockResolvedValueOnce(new Response('%PDF-test'));
  const client = createDtdcSandboxClient('test-key', 'test-token', request);
  expect(await client.book(consignment)).toBe('AWB123');
  expect(await client.track('AWB123')).toBe('Booked');
  expect(new TextDecoder().decode(await client.label('AWB123'))).toBe('%PDF-test');
  expect(request.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
    'alphademodashboardapi.shipsy.io', 'dtdcstagingapi.dtdc.com', 'lut-details-2-demo.demoprojectxsandbox4.shipsy.io',
  ]);
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ consignments: [consignment] });
  expect(new URL(String(request.mock.calls[2][0])).searchParams.get('reference_number')).toBe('AWB123');
});

it('rejects invalid labels and HTTP failures without returning provider data', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('not a PDF'))
    .mockResolvedValueOnce(new Response('provider detail', { status: 401 }));
  const client = createDtdcSandboxClient('test-key', 'test-token', request);
  await expect(client.label('AWB123')).rejects.toThrow('invalid shipping label');
  await expect(client.track('AWB123')).rejects.toThrow('HTTP 401');
  await expect(client.label('../other')).rejects.toThrow('Invalid DTDC consignment reference');
});

it('treats a failed booking request as uncertain and requires reconciliation', async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('network failure'));
  const client = createDtdcSandboxClient('test-key', 'test-token', request);
  await expect(client.book(consignment)).rejects.toThrow('Check DTDC before retrying');
  expect(request).toHaveBeenCalledTimes(1);
});

it('rejects labels exceeding the size limit', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
  const client = createDtdcSandboxClient('test-key', 'test-token', request);
  await expect(client.label('AWB123')).rejects.toThrow('exceeds the size limit');
});
