import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { orderMarginBasis } from './margin.ts';
import { createOrderPayload, createShiprocketClient, identifier, parseCouriers, parsePackage,
  record, safeLabel, trackingStatus, trackingDeliveryDate } from './shiprocket.ts';
import { chargeableWeight, createDelhiveryClient, createdWaybill, delhiveryPayload, labelUrl, readDelhiveryConfig,
  serviceable, shippingCharge, tracking as delhiveryTracking } from './delhivery.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const message = (failure: unknown) => failure && typeof failure === 'object' && 'message' in failure
  ? String(failure.message) : 'Shipping request failed.';
function matchesSecret(value: string, secret: string | undefined) {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  let difference = value.length ^ expected.length;
  for (let index=0; index<expected.length; index++) difference |= expected.charCodeAt(index) ^ (value.charCodeAt(index) || 0);
  return difference === 0;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' },405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Admin authentication required.' },401);
  let body: Record<string, unknown>;
  try { body = record(await request.json()); } catch { return json({ error: 'Invalid shipping request.' },400); }
  const worker = body.action === 'sync-due' || body.action === 'check-connection';
  let actor = '';
  const url = Deno.env.get('SUPABASE_URL')!;
  if (worker) {
    if (!matchesSecret(authorization,Deno.env.get('CUSTOMER_WELCOME_WORKER_SECRET'))) {
      return json({ error: 'Worker authentication required.' },401);
    }
  } else {
    const client = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user?.email_confirmed_at || identity.user.is_anonymous) {
      return json({ error: 'A verified admin session is required.' },401);
    }
    const { data: permitted, error } = await client.rpc('is_catalogue_admin');
    if (error || permitted !== true) return json({ error: 'Recent admin authenticator verification required.' },403);
    actor = identity.user.id;
    if (!['status','quote','book','label','pickup','sync'].includes(String(body.action))
      || typeof body.orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId)) {
      return json({ error: 'Invalid shipping action or order.' },400);
    }
  }
  const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data,error } = await db.rpc(name,args);
    if (error) throw error;
    return data;
  };
  const readOrder = async (id: string) => {
    const { data,error } = await db.from('payment_orders').select('*').eq('id',id).single();
    if (error) throw new Error('Unable to read shipping order.');
    if (!data.is_live_checkout || data.is_test_checkout || data.status !== 'paid') throw new Error('Only paid live orders can be shipped.');
    return data;
  };
  const readShipping = async (id: string) => {
    const { data,error } = await db.from('order_shipping').select('*').eq('order_id',id).maybeSingle();
    if (error) throw new Error('Unable to read shipping details.');
    return data;
  };
  const state = async (id: string) => {
    const order = await readOrder(id);
    const shipping = await readShipping(id);
    const { data: marginItems,error: marginError } = await db.from('payment_order_items')
      .select('quantity,line_total_paise,seller_sales(quantity,gst_percent,material_cost,labour_cost,packaging_cost,gateway_fee_percent,gateway_fee_gst_percent)')
      .eq('order_id',id);
    if (marginError) throw new Error('Unable to read saved order costs for courier margin estimates.');
    const { data: ledgerOrder,error: ledgerError } = await db.from('seller_orders')
      .select('packaging_cost').eq('payment_order_id',id).maybeSingle();
    if (ledgerError) throw new Error('Unable to read whole-order packaging cost.');
    const marginBasis = ledgerOrder ? orderMarginBasis(Number(order.subtotal_paise),Number(order.discount_paise),
      Number(order.shipping_paise),marginItems ?? [],Number(ledgerOrder.packaging_cost)) : null;
    const quotes = Array.isArray(shipping?.quotes) ? shipping.quotes : [];
    const selected = quotes.find((q: { id: number }) => q.id === shipping?.courier_id);
    return { marginBasis, provider: shipping?.provider ?? 'shiprocket', parcel: shipping?.package ?? null, quotes: shipping?.quotes ?? [], quotedAt: shipping?.quoted_at ?? null,
      shipmentId: shipping?.shipment_id ?? null, awb: shipping?.awb ?? null, courierName: shipping?.courier_name ?? null,
      labelUrl: shipping?.label_url ?? null, pickupRequested: shipping?.pickup_requested ?? false,
      reviewRequired: shipping?.review_required ?? false, busy: Boolean(shipping?.operation),
      lastError: shipping?.last_error ?? shipping?.tracking_error ?? null,
      trackingStatus: shipping?.tracking_status ?? null, syncedAt: shipping?.synced_at ?? null,
      fulfilment: { deliveryEstimate: shipping?.awb && (!order.tracking_number || order.tracking_number === shipping.awb) ? {
        courierName: shipping.courier_name,transitDays: selected?.days ?? null,
        expectedDate: shipping.estimated_delivery_date ?? null,updatedAt: shipping.synced_at ?? shipping.updated_at ?? null,
      } : null,status: order.fulfilment_status, courierName: order.courier_name,
        trackingNumber: order.tracking_number, trackingUrl: order.tracking_url, updatedAt: order.fulfilment_updated_at } };
  };
  try {
    if (body.action === 'status') return json(await state(String(body.orderId)));
    const shiprocket = () => {
      const email = Deno.env.get('SHIPROCKET_EMAIL')?.trim();
      const password = Deno.env.get('SHIPROCKET_PASSWORD');
      const pickupPin = Deno.env.get('SHIPROCKET_PICKUP_PINCODE')?.trim();
      const pickupLocation = Deno.env.get('SHIPROCKET_PICKUP_LOCATION')?.trim();
      if (!email || !password || !pickupPin || !pickupLocation || !/^[1-9][0-9]{5}$/.test(pickupPin)) {
        throw new Error('Shipping is not configured. Set Shiprocket API credentials, pickup pincode and pickup location.');
      }
      const api = createShiprocketClient(email,password, {
        read: async () => {
          const { data,error } = await db.from('shiprocket_auth_tokens').select('token').eq('id',1)
            .gt('expires_at',new Date(Date.now()+3600000).toISOString()).maybeSingle();
          if (error) throw new Error('Unable to read Shiprocket authentication.');
          return data?.token ?? null;
        },
        write: async (token,expiresAt) => {
          const { error } = await db.from('shiprocket_auth_tokens').upsert({ id: 1,token,expires_at: expiresAt });
          if (error) throw new Error('Unable to save Shiprocket authentication.');
        },
      },15000);
      return { api,pickupPin,pickupLocation };
    };
    const delhiveryApi = () => {
      const token = Deno.env.get('DELHIVERY_LIVE_TOKEN')?.trim();
      if (!token) throw new Error('Delhivery API token is not configured.');
      return createDelhiveryClient(token);
    };
    const delhivery = () => {
      const config = readDelhiveryConfig(key => Deno.env.get(key));
      return { ...config,api: createDelhiveryClient(config.token) };
    };
    if (body.action === 'check-connection') {
      if (body.provider === 'delhivery') {
        const result = await delhiveryApi()('/c/api/pin-codes/json/?filter_codes=110001');
        const available = serviceable(result,'110001');
        if (body.checkRates === true && available) {
          const { api,pickupPin } = delhivery();
          const query = new URLSearchParams({ md: 'S',ss: 'Delivered',pt: 'Pre-paid',o_pin: pickupPin,
            d_pin: '110001',cgm: '500',l: '10',b: '10',h: '10' });
          shippingCharge(await api(`/api/kinko/v1/invoice/charges/.json?${query}`));
          return json({ connected: true,serviceable: true,rateAvailable: true,shipmentCreated: false });
        }
        return json({ connected: true,serviceable: available,shipmentCreated: false });
      }
      const { api,pickupPin } = shiprocket();
      const query = new URLSearchParams({ pickup_postcode: pickupPin,delivery_postcode: '110001',weight: '0.5',cod: '0' });
      const couriers = parseCouriers(await api(`/courier/serviceability/?${query}`));
      return json({ connected: true,availableCouriers: couriers.length,shipmentCreated: false });
    }
    const sync = async (id: string, shipping: { provider?: string; shipment_id: number; awb?: string }) => {
      try {
        let status: string;
        let expectedDate: string | null;
        if (shipping.provider === 'delhivery') {
          if (!shipping.awb) throw new Error('Delhivery waybill missing.');
          const result = delhiveryTracking(await delhiveryApi()(`/api/v1/packages/json/?${new URLSearchParams({ waybill: shipping.awb })}`),shipping.awb);
          status = result.status; expectedDate = result.expectedDate;
        } else {
          const { api } = shiprocket();
          const result = await api(`/courier/track/shipment/${identifier(shipping.shipment_id)}`);
          status = trackingStatus(result); expectedDate = trackingDeliveryDate(result);
        }
        const { error: estimateError } = await db.from('order_shipping').update({
          estimated_delivery_date: expectedDate,
        }).eq('order_id',id);
        if (estimateError) throw new Error('Unable to save courier delivery estimate.');
        await rpc('sync_order_shipping',{ p_order_id: id,p_status: status });
      } catch (failure) {
        const { error } = await db.from('order_shipping').update({
          tracking_error: message(failure).slice(0,500),tracking_checked_at: new Date().toISOString(),
        }).eq('order_id',id);
        if (error) console.error('Unable to record tracking failure:',id,error.message);
        throw failure;
      }
    };
    if (worker) {
      const { data: jobs,error } = await db.from('order_shipping')
        .select('order_id,provider,shipment_id,awb,payment_orders!inner(status,fulfilment_status)')
        .not('awb','is',null).eq('payment_orders.status','paid').neq('payment_orders.fulfilment_status','delivered')
        .or(`tracking_checked_at.is.null,tracking_checked_at.lt.${new Date(Date.now()-1800000).toISOString()}`)
        .order('tracking_checked_at',{ ascending: true,nullsFirst: true }).limit(3);
      if (error) throw new Error('Unable to load shipments due for tracking.');
      let failed=0;
      for (const job of jobs ?? []) {
        try { await sync(job.order_id,job); }
        catch (failure) { failed++; console.error('Shipment tracking failed:',job.order_id,message(failure)); }
      }
      return json({ synced: (jobs?.length ?? 0)-failed,failed },failed ? 502 : 200);
    }
    const id = String(body.orderId);
    const order = await readOrder(id);
    const couriers = async (parcel: ReturnType<typeof parsePackage>) => {
      const { api,pickupPin } = shiprocket();
      const address = record(order.delivery_details);
      const query = new URLSearchParams({ pickup_postcode: pickupPin,delivery_postcode: String(address.pincode),
        weight: String(parcel.weight),length: String(parcel.length),breadth: String(parcel.breadth),height: String(parcel.height),cod: '0' });
      return parseCouriers(await api(`/courier/serviceability/?${query}`));
    };
    const delhiveryCouriers = async (parcel: ReturnType<typeof parsePackage>) => {
      const { api,pickupPin,volumetricDivisor } = delhivery();
      const address = record(order.delivery_details);
      const pin = String(address.pincode);
      if (!/^[1-9][0-9]{5}$/.test(pin)) throw new Error('Invalid delivery pincode.');
      if (!serviceable(await api(`/c/api/pin-codes/json/?${new URLSearchParams({ filter_codes: pin })}`),pin)) return [];
      const query = new URLSearchParams({ md: 'S',ss: 'Delivered',pt: 'Pre-paid',o_pin: pickupPin,d_pin: pin,
        cgm: String(chargeableWeight(parcel,volumetricDivisor)),l: String(Math.ceil(parcel.length)),
        b: String(Math.ceil(parcel.breadth)),h: String(Math.ceil(parcel.height)) });
      const charge = shippingCharge(await api(`/api/kinko/v1/invoice/charges/.json?${query}`));
      return [{ id: 1,name: 'Delhivery Surface',charge,days: null,recommended: false }];
    };
    if (body.action === 'quote') {
      const parcel = parsePackage(body.parcel);
      const provider = body.provider ?? 'shiprocket';
      if (provider !== 'shiprocket' && provider !== 'delhivery') throw new Error('Invalid shipping provider.');
      const items = await (async () => {
        const { data,error } = await db.from('payment_order_items').select('*').eq('order_id',id);
        if (error) throw new Error('Unable to read order items.');
        return data ?? [];
      })();
      if (provider === 'delhivery') delhiveryPayload(order,items,parcel,delhivery().pickupLocation);
      else createOrderPayload(order,items,parcel,shiprocket().pickupLocation);
      const quotes = provider === 'delhivery' ? await delhiveryCouriers(parcel) : await couriers(parcel);
      await rpc(provider === 'delhivery' ? 'save_delhivery_shipping_quote' : 'save_order_shipping_quote',
        { p_order_id: id,p_package: parcel,p_quotes: quotes,p_actor: actor });
      return json(await state(id));
    }
    const shipping = await readShipping(id);
    if (body.action === 'sync') {
      if (!shipping?.awb) throw new Error('Book a shipment before checking tracking.');
      await sync(id,shipping);
      return json(await state(id));
    }
    if (body.action === 'label') {
      if (!shipping?.awb) throw new Error('Book a shipment before generating a label.');
      let url: string;
      if (shipping.provider === 'delhivery') {
        const query = new URLSearchParams({ wbns: shipping.awb,pdf: 'true',pdf_size: '4R' });
        url = labelUrl(await delhiveryApi()(`/api/p/packing_slip?${query}`),shipping.awb);
      } else {
        const { api } = shiprocket();
        const label = await api('/courier/generate/label',{ shipment_id: [shipping.shipment_id] });
        if (Number(label.label_created) !== 1) throw new Error('Shiprocket has not generated the label. Retry label generation later.');
        url = safeLabel(label.label_url);
      }
      const { error } = await db.from('order_shipping').update({ label_url: url }).eq('order_id',id);
      if (error) throw new Error('Unable to save the shipping label. Retry label generation.');
      return json(await state(id));
    }
    if (body.action === 'pickup' && shipping?.provider === 'delhivery') {
      throw new Error('Request Delhivery pickup in Delhivery One. Pickup requests apply to the entire warehouse.');
    }
    if (body.action === 'book' || body.action === 'pickup') {
      if (shipping?.provider === 'delhivery') delhivery(); else shiprocket();
    }
    // Claim before any provider mutation. An interrupted or ambiguous operation stays blocked for reconciliation.
    if (body.action === 'book' && (body.readyToShip !== true || typeof body.quotedAt !== 'string'
      || !Number.isFinite(Date.parse(body.quotedAt)))) throw new Error('Confirm ready to ship and approve current courier rates.');
    const operation = crypto.randomUUID();
    const claimed = record(await rpc('claim_order_shipping',{ p_order_id: id,p_operation: operation,
      p_action: body.action,p_actor: actor,p_courier_id: body.action === 'book' ? identifier(body.courierId) : null,
      p_quoted_at: body.action === 'book' ? body.quotedAt : null }));
    const save = async (values: Record<string, unknown>) => {
      const { data,error } = await db.from('order_shipping').update({ ...values,updated_at: new Date().toISOString() })
        .eq('order_id',id).eq('operation',operation).select('order_id').single();
      if (error || !data) throw new Error('Unable to persist shipment. Reconcile with the shipping provider before retrying.');
    };
    let providerMutationStarted = false;
    try {
      if (body.action === 'book') {
        const parcel = parsePackage(claimed.package);
        const provider = claimed.provider === 'delhivery' ? 'delhivery' : 'shiprocket';
        const current = (provider === 'delhivery' ? await delhiveryCouriers(parcel) : await couriers(parcel))
          .find(q => q.id === claimed.courier_id);
        if (!current || current.charge > Number(claimed.approved_charge)) {
          throw new Error('Courier availability or price changed. Check rates and approve again.');
        }
        const { data: items,error } = await db.from('payment_order_items').select('*').eq('order_id',id);
        if (error) throw new Error('Unable to read order items.');
        if (provider === 'delhivery') {
          const { api,pickupLocation } = delhivery();
          const payload = delhiveryPayload(order,items ?? [],parcel,pickupLocation);
          providerMutationStarted = true;
          const created = await api('/api/cmu/create.json',`format=json&data=${JSON.stringify(payload)}`);
          const awb = createdWaybill(created,String(order.reference));
          await save({ awb,operation: null,last_error: null });
        } else {
          const { api,pickupLocation } = shiprocket();
          const payload = createOrderPayload(order,items ?? [],parcel,pickupLocation);
          providerMutationStarted = true;
          const created = await api('/orders/create/adhoc',payload);
          const providerOrder = identifier(created.order_id);
          const shipment = identifier(created.shipment_id);
          await save({ provider_order_id: providerOrder,shipment_id: shipment });
          const assigned = await api('/courier/assign/awb',{ shipment_id: shipment,courier_id: claimed.courier_id });
          if (Number(assigned.awb_assign_status) !== 1) throw new Error('AWB assignment was not confirmed.');
          const details = record(record(assigned.response).data);
          const awb = details.awb_code;
          if (typeof awb !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(awb)
            || identifier(details.shipment_id) !== shipment || identifier(details.courier_company_id) !== claimed.courier_id) {
            throw new Error('AWB response did not match the approved courier and shipment.');
          }
          await save({ awb,operation: null,last_error: null });
        }
      } else {
        const { api } = shiprocket();
        providerMutationStarted = true;
        const pickup = await api('/courier/generate/pickup',{ shipment_id: [identifier(claimed.shipment_id)] });
        if (Number(pickup.pickup_status) !== 1) throw new Error('Pickup was not confirmed by Shiprocket.');
        await save({ pickup_requested: true,operation: null,last_error: null });
      }
    } catch (failure) {
      try { await save({ review_required: providerMutationStarted,operation: null,last_error: message(failure).slice(0,500) }); }
      catch (saveFailure) { console.error('Unable to record shipment reconciliation:',id,message(saveFailure)); }
      throw new Error(`${message(failure)}${providerMutationStarted
        ? ' Booking is blocked until an operator reconciles this order with the shipping provider.' : ''}`);
    }
    return json(await state(id));
  } catch (failure) {
    console.error('Order shipping failed:',message(failure));
    const text = message(failure);
    return json({ error: text },text.startsWith('Shipping is not configured.') || text.startsWith('Delhivery is not configured.') ? 503 : 400);
  }
});
