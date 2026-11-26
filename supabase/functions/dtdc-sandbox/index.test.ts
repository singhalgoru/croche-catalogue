// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { DtdcBookingError } from '../order-shipping/dtdcSandbox.ts';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), permission: vi.fn(), book: vi.fn(), track: vi.fn(), label: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: (_url: string, _key: string, options?: { global?: unknown }) => options?.global
    ? { auth: { getUser: mocks.getUser }, rpc: mocks.permission } : { from: () => new Query() },
}));
vi.mock('../order-shipping/dtdcSandbox.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../order-shipping/dtdcSandbox.ts')>(),
  createDtdcSandboxClient: () => ({ book: mocks.book, track: mocks.track, label: mocks.label }),
}));

type Booking = { id: string; customer_reference: string; state: string; awb?: string; created_at: string };
let bookings: Booking[];
let environment: Record<string, string>;
let failBookedUpdate: boolean;
class Query {
  private changes: Partial<Booking> | null = null;
  private filters: ((row: Booking) => boolean)[] = [];
  select() { return this; }
  order() { return this; }
  limit() { return Promise.resolve({ data: bookings, error: null }); }
  insert(value: Booking) {
    if (bookings.some(item => ['pending', 'review'].includes(item.state))) return Promise.resolve({ error: { message: 'unique' } });
    bookings.push({ ...value, created_at: new Date().toISOString() });
    return Promise.resolve({ error: null });
  }
  update(value: Partial<Booking>) { this.changes = value; return this; }
  eq(key: keyof Booking, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: keyof Booking, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this; }
  lt(key: keyof Booking, value: string) { this.filters.push(row => String(row[key]) < value); return this; }
  maybeSingle() {
    const row = bookings.find(item => this.filters.every(filter => filter(item)));
    if (this.changes?.state === 'booked' && failBookedUpdate) {
      return Promise.resolve({ data: null, error: { message: 'database unavailable' } });
    }
    if (row && this.changes) Object.assign(row, this.changes);
    return Promise.resolve({ data: row ?? null, error: null });
  }
  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    const row = bookings.find(item => this.filters.every(filter => filter(item)));
    if (row && this.changes) Object.assign(row, this.changes);
    return Promise.resolve({ data: row ?? null, error: null }).then(resolve);
  }
}

let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => environment[name] }, serve: (fn: typeof handle) => { handle = fn; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); bookings = []; failBookedUpdate = false;
  environment = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test',
    SUPABASE_SERVICE_ROLE_KEY: 'test', DTDC_SANDBOX_ENABLED: 'true', DTDC_SANDBOX_API_KEY: 'test',
    DTDC_SANDBOX_TRACKING_TOKEN: 'test', DTDC_SANDBOX_CUSTOMER_CODE: 'test', DTDC_SANDBOX_SERVICE_TYPE: 'test' };
  mocks.getUser.mockResolvedValue({ data: { user: { id: '00000000-0000-4000-8000-000000000003',
    email_confirmed_at: '2026-01-01', is_anonymous: false } }, error: null });
  mocks.permission.mockResolvedValue({ data: true, error: null });
  mocks.book.mockResolvedValue('AWB123');
  mocks.track.mockResolvedValue('Booked');
  mocks.label.mockResolvedValue(new TextEncoder().encode('%PDF-test'));
});
const request = (body: object, auth = true) => new Request('https://example.test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test' } : {}) },
  body: JSON.stringify(body),
});

it('requires admin verification, explicit sandbox enablement and confirmation', async () => {
  expect((await handle(request({ action: 'book', confirmed: true }, false))).status).toBe(401);
  mocks.permission.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(403);
  delete environment.DTDC_SANDBOX_ENABLED;
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(503);
  environment.DTDC_SANDBOX_ENABLED = 'true';
  expect((await handle(request({ action: 'book' }))).status).toBe(400);
  expect(mocks.book).not.toHaveBeenCalled();
});

it('books only synthetic data and allows tracking and labels only for the saved AWB', async () => {
  const response = await handle(request({ action: 'book', confirmed: true, customer: 'ignored' }));
  expect(response.status).toBe(200);
  const { id } = await response.json();
  expect(bookings[0]).toMatchObject({ state: 'booked', awb: 'AWB123' });
  expect(mocks.book).toHaveBeenCalledWith(expect.objectContaining({
    description: 'Sandbox test parcel', customer_reference_number: bookings[0].customer_reference,
    commodity_id: '7', length: '10', width: '10', height: '10', weight: '0.5',
    declared_value: '100', num_pieces: '1',
    destination_details: expect.objectContaining({ name: 'Sandbox Test' }),
  }));
  expect(await (await handle(request({ action: 'track', id }))).json()).toEqual({ status: 'Booked' });
  expect(await (await handle(request({ action: 'label', id }))).json()).toEqual({ pdf: btoa('%PDF-test') });
  expect((await handle(request({ action: 'track', id: '00000000-0000-4000-8000-000000000099' }))).status).toBe(404);
});

it('blocks another booking after an uncertain result until explicitly reconciled', async () => {
  mocks.book.mockRejectedValueOnce(new Error('timeout'));
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(502);
  expect(bookings[0].state).toBe('review');
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(409);
  expect((await handle(request({ action: 'clear', id: bookings[0].id, confirmed: true }))).status).toBe(409);
  bookings[0].created_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  expect((await handle(request({ action: 'clear', id: bookings[0].id, confirmed: true }))).status).toBe(200);
  expect(bookings[0].state).toBe('cleared');
});

it('shows safe booking diagnostics while keeping the result in review', async () => {
  mocks.book.mockRejectedValueOnce(new DtdcBookingError('DTDC returned HTTP 401. Check DTDC before retrying.'));
  const response = await handle(request({ action: 'book', confirmed: true }));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('HTTP 401');
  expect(bookings[0].state).toBe('review');
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(409);
});

it('keeps the booking unresolved if saving a confirmed AWB fails', async () => {
  failBookedUpdate = true;
  const response = await handle(request({ action: 'book', confirmed: true }));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('saving it failed');
  expect(bookings[0].state).toBe('pending');
  expect((await handle(request({ action: 'book', confirmed: true }))).status).toBe(409);
  expect(mocks.book).toHaveBeenCalledOnce();
});
