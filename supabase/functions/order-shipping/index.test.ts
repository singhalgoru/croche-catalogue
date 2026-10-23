// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { getUser,permission,rpc,from,api } = vi.hoisted(() => ({
  getUser: vi.fn(),permission: vi.fn(),rpc: vi.fn(),from: vi.fn(),api: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2',() => ({
  createClient: (_url: string,_key: string,options?: { global?: unknown }) => options?.global
    ? { auth: { getUser },rpc: permission } : { rpc,from },
}));
vi.mock('./shiprocket.ts',async importOriginal => ({
  ...await importOriginal<typeof import('./shiprocket')>(),createShiprocketClient: () => api,
}));
const id = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000002';
const parcel = { weight: 0.5,length: 20,breadth: 15,height: 10 };
const quotedAt = '2026-10-20T14:00:00Z';
const order = { id,status: 'paid',is_live_checkout: true,is_test_checkout: false,
  reference: 'LUV-123',created_at: quotedAt,subtotal_paise: 50000,discount_paise: 0,shipping_paise: 0,
  fulfilment_status: 'confirmed',courier_name: '',tracking_number: '',tracking_url: '',fulfilment_updated_at: null,
  delivery_details: { name: 'Buyer',phone: '9876543210',email: 'buyer@example.test',
    addressLine1: '12 Test Street',city: 'Delhi',state: 'Delhi',pincode: '110001' } };
type Result = { data: unknown; error: { message: string } | null };
let shipping: Record<string, unknown> | null;
let currentOrder: typeof order;
let updates: Record<string, unknown>[];
let failSave: boolean;
let claimError: boolean;
let jobs: { order_id: string; shipment_id: number }[];
let environment: Record<string,string>;
class Query {
  private many = false;
  constructor(private table: string,private changes?: Record<string, unknown>) {}
  select() { return this; } eq() { return this; } not() { return this; } neq() { return this; }
  gt() { return this; } or() { return this; } order() { return this; }
  limit() { this.many=true; return this; }
  update(changes: Record<string, unknown>) { this.changes=changes; return this; }
  async result(): Promise<Result> {
    if (this.changes) {
      updates.push(this.changes);
      if (failSave) return { data: null,error: { message: 'Database offline' } };
      shipping = { ...shipping,...this.changes };
      return { data: { order_id: id },error: null };
    }
    return { data: this.table === 'payment_orders' ? currentOrder
      : this.table === 'seller_orders' ? { packaging_cost: 10 }
      : this.table === 'payment_order_items' ? [{ product_name: 'Rose',variant_name: 'Pink',variant_id: 'variant',quantity: 1,unit_price_paise: 50000,
        line_total_paise: 50000,seller_sales: [{ quantity: 1,gst_percent: 5,material_cost: 100,labour_cost: 50,
          packaging_cost: 10,gateway_fee_percent: 2,gateway_fee_gst_percent: 18 }] }]
      : this.many ? jobs : shipping,error: null };
  }
  single() { return this.result(); } maybeSingle() { return this.result(); }
  then(resolve: (value: Result) => unknown,reject: (reason: unknown) => unknown) { return this.result().then(resolve,reject); }
}
let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno',{ env: { get: (key: string) => environment[key] },serve: (handler: typeof handle) => { handle=handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); currentOrder={ ...order }; updates=[]; failSave=false; claimError=false; jobs=[];
  environment = { SUPABASE_URL: 'https://example.test',SUPABASE_ANON_KEY: 'anon',SUPABASE_SERVICE_ROLE_KEY: 'service',
    SHIPROCKET_EMAIL: 'api@example.test',SHIPROCKET_PASSWORD: 'fixture',SHIPROCKET_PICKUP_PINCODE: '110001',
    SHIPROCKET_PICKUP_LOCATION: 'Primary',CUSTOMER_WELCOME_WORKER_SECRET: 'worker-fixture' };
  shipping = { order_id: id,package: parcel,quotes: [{ id: 10,name: 'Courier',charge: 85,days: 3,recommended: true }],
    quoted_at: quotedAt,courier_id: 10,courier_name: 'Courier',approved_charge: 85 };
  getUser.mockResolvedValue({ data: { user: { id: actor,email_confirmed_at: quotedAt,is_anonymous: false } },error: null });
  permission.mockResolvedValue({ data: true,error: null });
  from.mockImplementation((table: string) => new Query(table));
  rpc.mockImplementation(async (name: string) => name === 'claim_order_shipping' && claimError
    ? { data: null,error: { message: 'Shipment already exists or needs reconciliation.' } }
    : { data: name === 'claim_order_shipping' ? shipping : true,error: null });
  api.mockImplementation(async (path: string) => {
    if (path.startsWith('/courier/serviceability')) return { data: {
      recommended_courier_company_id: 10,available_courier_companies: [
        { courier_company_id: 10,courier_name: 'Courier',rate: 85,estimated_delivery_days: '3' },
      ],
    } };
    if (path === '/orders/create/adhoc') return { order_id: 111,shipment_id: 222 };
    if (path === '/courier/assign/awb') return { awb_assign_status: 1,response: {
      data: { shipment_id: 222,courier_company_id: 10,awb_code: 'AWB123' },
    } };
    if (path === '/courier/generate/pickup') return { pickup_status: 1 };
    if (path === '/courier/generate/label') return { label_created: 1,label_url: 'https://labels.example/label.pdf' };
    if (path.startsWith('/courier/track/shipment')) return { tracking_data: {
      track_status: 1,shipment_track: [{ current_status: 'IN TRANSIT' }],
    } };
    throw new Error('Unexpected API endpoint');
  });
});
const request = (body: unknown,authorization: string | null='Bearer admin') => new Request('https://example.test/shipping',{
  method: 'POST',headers: { 'Content-Type': 'application/json',...(authorization ? { Authorization: authorization } : {}) },
  body: JSON.stringify(body),
});
const book = () => request({ action: 'book',orderId: id,courierId: 10,quotedAt,readyToShip: true });
it('requires verified admin MFA and rejects unauthorized worker calls',async () => {
  expect((await handle(request({ action: 'status',orderId: id },null))).status).toBe(401);
  permission.mockResolvedValueOnce({ data: false,error: null });
  expect((await handle(book())).status).toBe(403);
  expect((await handle(request({ action: 'sync-due' }))).status).toBe(401);
  expect(api).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
});
it('rejects malformed and unsupported requests',async () => {
  expect((await handle(request({ action: 'book',orderId: 'bad' }))).status).toBe(400);
  expect((await handle(request({ action: 'delete',orderId: id }))).status).toBe(400);
  expect(api).not.toHaveBeenCalled();
});
it('loads status without requiring provider configuration or calling Shiprocket',async () => {
  delete environment.SHIPROCKET_EMAIL;
  const response=await handle(request({ action: 'status',orderId: id }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ parcel,quotes: shipping?.quotes,awb: null,fulfilment: { status: 'confirmed' } });
  expect(api).not.toHaveBeenCalled();
});
it('returns admin-only saved cost basis without creating a provider shipment',async () => {
  const response = await handle(request({ action: 'status',orderId: id }));
  const data = await response.json();
  expect(data).toMatchObject({ marginBasis: {
    revenue: 500,gst: 500 * 5 / 105,productCosts: 160,
  } });
  expect(data.marginBasis.gatewayFee).toBeCloseTo(11.8);
  expect(api).not.toHaveBeenCalled();
});
it('rejects unpaid, test and non-live orders before provider calls',async () => {
  for (const change of [{ status: 'link_created' },{ is_test_checkout: true },{ is_live_checkout: false }]) {
    currentOrder={ ...order,...change };
    expect((await handle(book())).status).toBe(400);
  }
  expect(api).not.toHaveBeenCalled();
});
it('reports missing pickup configuration and does not claim or book an order',async () => {
  delete environment.SHIPROCKET_PICKUP_LOCATION;
  expect((await handle(book())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
});
it('quotes the measured package with dimensions and persists server-owned courier options',async () => {
  const response=await handle(request({ action: 'quote',orderId: id,parcel }));
  expect(response.status).toBe(200);
  expect(api.mock.calls[0][0]).toContain('weight=0.5&length=20&breadth=15&height=10&cod=0');
  expect(rpc).toHaveBeenCalledWith('save_order_shipping_quote',{
    p_order_id: id,p_package: parcel,p_actor: actor,p_quotes: [{ id: 10,name: 'Courier',charge: 85,days: 3,recommended: true }],
  });
  expect(api).not.toHaveBeenCalledWith('/orders/create/adhoc',expect.anything());
});
it('books only after approval and persists provider IDs before assigning AWB',async () => {
  const response=await handle(book());
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('claim_order_shipping',expect.objectContaining({
    p_action: 'book',p_actor: actor,p_courier_id: 10,p_quoted_at: quotedAt,
  }));
  expect(updates[0]).toMatchObject({ provider_order_id: 111,shipment_id: 222 });
  expect(updates[1]).toMatchObject({ awb: 'AWB123',operation: null });
  expect(api).toHaveBeenCalledWith('/courier/assign/awb',{ shipment_id: 222,courier_id: 10 });
  expect(rpc).not.toHaveBeenCalledWith('sync_order_shipping',expect.anything());
});
it('requires explicit ready-to-ship approval and the quoted version',async () => {
  const response=await handle(request({ action: 'book',orderId: id,courierId: 10 }));
  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
});
it('stops duplicate and concurrent booking attempts before provider side effects',async () => {
  claimError=true;
  expect((await handle(book())).status).toBe(400);
  expect(api).not.toHaveBeenCalled();
});
it('requires fresh approval if the courier rate increases',async () => {
  if (shipping) shipping.approved_charge=80;
  expect((await handle(book())).status).toBe(400);
  expect(updates).toContainEqual(expect.objectContaining({ operation: null,review_required: false }));
  expect(api).not.toHaveBeenCalledWith('/orders/create/adhoc',expect.anything());
});
it('marks ambiguous order creation for reconciliation without retrying',async () => {
  api.mockImplementationOnce(async () => ({ data: { available_courier_companies: [
    { courier_company_id: 10,courier_name: 'Courier',rate: 85 },
  ] } })).mockRejectedValueOnce(new Error('Provider timeout'));
  const response=await handle(book());
  expect(response.status).toBe(400);
  expect(updates).toContainEqual(expect.objectContaining({ review_required: true,operation: null }));
  expect(api.mock.calls.filter(([path]) => path === '/orders/create/adhoc')).toHaveLength(1);
  expect((await response.json()).error).toContain('reconciles');
});
it('retains known provider identifiers if AWB assignment fails',async () => {
  api.mockImplementation(async (path: string) => path.startsWith('/courier/serviceability')
    ? { data: { available_courier_companies: [{ courier_company_id: 10,courier_name: 'Courier',rate: 85 }] } }
    : path === '/orders/create/adhoc' ? { order_id: 111,shipment_id: 222 } : { awb_assign_status: 0 });
  expect((await handle(book())).status).toBe(400);
  expect(shipping).toMatchObject({ provider_order_id: 111,shipment_id: 222,review_required: true });
});
it('does not assign an AWB if provider identifiers cannot be persisted',async () => {
  failSave=true;
  expect((await handle(book())).status).toBe(400);
  expect(api).not.toHaveBeenCalledWith('/courier/assign/awb',expect.anything());
});
it('requests pickup for a known shipment and persists success separately from fulfilment',async () => {
  shipping={ ...shipping,shipment_id: 222,awb: 'AWB123' };
  const response=await handle(request({ action: 'pickup',orderId: id }));
  expect(response.status).toBe(200);
  expect(api).toHaveBeenCalledWith('/courier/generate/pickup',{ shipment_id: [222] });
  expect(shipping?.pickup_requested).toBe(true);
  expect(rpc).not.toHaveBeenCalledWith('sync_order_shipping',expect.anything());
});
it('generates labels and syncs tracking through the authoritative database transition',async () => {
  shipping={ ...shipping,shipment_id: 222,awb: 'AWB123' };
  expect((await handle(request({ action: 'label',orderId: id }))).status).toBe(200);
  expect(shipping?.label_url).toBe('https://labels.example/label.pdf');
  expect((await handle(request({ action: 'sync',orderId: id }))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('sync_order_shipping',{ p_order_id: id,p_status: 'IN TRANSIT' });
});
it('returns the booked courier transit estimate and updates its tracking ETA',async () => {
  shipping={ ...shipping,shipment_id: 222,awb: 'AWB123',updated_at: quotedAt };
  const response=await handle(request({ action: 'status',orderId: id }));
  expect(await response.json()).toMatchObject({ fulfilment: { deliveryEstimate: {
    courierName: 'Courier',transitDays: 3,expectedDate: null,updatedAt: quotedAt,
  } } });
  api.mockResolvedValueOnce({ tracking_data: { track_status: 1,etd: '2026-10-25 18:00:00',
    shipment_track: [{ current_status: 'IN TRANSIT' }] } });
  expect((await handle(request({ action: 'sync',orderId: id }))).status).toBe(200);
  expect(updates).toContainEqual({ estimated_delivery_date: '2026-10-25' });
});
it('polls due shipments with the private worker secret without granting booking access',async () => {
  jobs=[{ order_id: id,shipment_id: 222 }];
  const response=await handle(request({ action: 'sync-due' },'Bearer worker-fixture'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ synced: 1,failed: 0 });
  expect(getUser).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('sync_order_shipping',{ p_order_id: id,p_status: 'IN TRANSIT' });
  expect(api).not.toHaveBeenCalledWith('/orders/create/adhoc',expect.anything());
});
it('checks provider authentication and serviceability without creating a shipment',async () => {
  expect((await handle(request({ action: 'check-connection' }))).status).toBe(401);
  const response=await handle(request({ action: 'check-connection' },'Bearer worker-fixture'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ connected: true,availableCouriers: 1,shipmentCreated: false });
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0][0]).toContain('/courier/serviceability/?');
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});
it('records failed tracking checks for backoff and reports scheduled failures explicitly',async () => {
  jobs=[{ order_id: id,shipment_id: 222 }];
  api.mockRejectedValueOnce(new Error('Tracking unavailable.'));
  const response=await handle(request({ action: 'sync-due' },'Bearer worker-fixture'));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ synced: 0,failed: 1 });
  expect(updates).toContainEqual(expect.objectContaining({
    tracking_error: 'Tracking unavailable.',tracking_checked_at: expect.any(String),
  }));
});
