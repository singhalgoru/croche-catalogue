const BOOKING_URL = 'https://alphademodashboardapi.shipsy.io/api/customer/integration/consignment/softdata';
const LABEL_URL = 'https://lut-details-2-demo.demoprojectxsandbox4.shipsy.io/api/customer/integration/consignment/shippinglabel/stream';
const TRACKING_URL = 'https://dtdcstagingapi.dtdc.com/dtdc-tracking-api/dtdc-api/rest/JSONCnTrk/getTrackDetails';

class DtdcHttpError extends Error {
  constructor(readonly status: number) {
    super(`DTDC sandbox request failed (HTTP ${status}).`);
  }
}

export class DtdcBookingError extends Error {}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DTDC returned an invalid response.');
  return value as Record<string, unknown>;
};

function reference(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,50}$/.test(value)) {
    throw new Error('Invalid DTDC consignment reference.');
  }
  return value;
}

export function dtdcBookingResult(value: unknown, customerReference: string): string {
  const response = record(value);
  if (response.status !== 'OK' || !Array.isArray(response.data) || response.data.length !== 1) {
    throw new Error('DTDC did not confirm the sandbox booking. Check DTDC before retrying.');
  }
  const consignment = record(response.data[0]);
  if (consignment.success !== true || consignment.customer_reference_number !== customerReference) {
    throw new Error('DTDC did not confirm the matching sandbox booking. Check DTDC before retrying.');
  }
  return reference(consignment.reference_number);
}

export function dtdcTrackingResult(value: unknown, awb: string): string {
  const response = record(value);
  if (response.statusCode !== 200 || response.statusFlag !== true || response.status !== 'SUCCESS') {
    throw new Error('DTDC tracking is not available for this consignment.');
  }
  const header = record(response.trackHeader);
  if (header.strShipmentNo !== awb || typeof header.strStatus !== 'string' || !header.strStatus.trim()) {
    throw new Error('DTDC returned invalid or mismatched tracking details.');
  }
  return header.strStatus.trim();
}

export interface DtdcSandboxAddress {
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  pincode: string;
  city: string;
  state: string;
}

export interface DtdcSandboxConsignment {
  customer_code: string;
  service_type_id: string;
  load_type: 'NON-DOCUMENT';
  consignment_type: 'Forward';
  description: string;
  commodity_id: string;
  dimension_unit: 'cm';
  length: string;
  width: string;
  height: string;
  weight_unit: 'kg';
  weight: string;
  declared_value: string;
  num_pieces: string;
  origin_details: DtdcSandboxAddress;
  destination_details: DtdcSandboxAddress;
  customer_reference_number: string;
}

export function createDtdcSandboxClient(apiKey: string, trackingToken: string, request: typeof fetch = fetch) {
  if (!apiKey.trim() || !trackingToken.trim()) throw new Error('DTDC sandbox credentials are required.');

  async function send(url: string, init: RequestInit): Promise<Response> {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new DtdcHttpError(response.status);
    return response;
  }

  async function json(response: Response): Promise<unknown> {
    try { return await response.json(); } catch { throw new Error('DTDC returned invalid JSON.'); }
  }

  return {
    async book(consignment: DtdcSandboxConsignment): Promise<string> {
      if (!consignment.customer_reference_number.trim()) throw new Error('A customer reference is required.');
      let response: Response;
      try {
        response = await send(BOOKING_URL, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({ consignments: [consignment] }) });
      } catch (failure) {
        const detail = failure instanceof DtdcHttpError ? `DTDC returned HTTP ${failure.status}.`
          : failure instanceof Error && failure.name === 'TimeoutError' ? 'The DTDC request timed out.'
            : 'The DTDC request could not be completed.';
        throw new DtdcBookingError(`${detail} Booking outcome is unknown. Check DTDC before retrying.`);
      }
      try {
        return dtdcBookingResult(await json(response), consignment.customer_reference_number);
      } catch {
        throw new DtdcBookingError('DTDC did not confirm the booking in its response. Check DTDC before retrying.');
      }
    },
    async track(awb: string): Promise<string> {
      reference(awb);
      const response = await send(TRACKING_URL, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Token': trackingToken },
        body: JSON.stringify({ trkType: 'cnno', strcnno: awb, addtnlDtl: 'Y' }) });
      return dtdcTrackingResult(await json(response), awb);
    },
    async label(awb: string): Promise<Uint8Array> {
      reference(awb);
      const query = new URLSearchParams({ reference_number: awb, label_code: 'SHIP_LABEL_4X6', label_format: 'pdf' });
      const response = await send(`${LABEL_URL}?${query}`, { method: 'GET', headers: { 'api-key': apiKey } });
      if (!response.body) throw new Error('DTDC returned an invalid shipping label.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            throw new Error('DTDC shipping label exceeds the size limit.');
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
        throw new Error('DTDC returned an invalid shipping label.');
      }
      return bytes;
    },
  };
}
