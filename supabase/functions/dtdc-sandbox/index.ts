import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createDtdcSandboxClient, DtdcBookingError, type DtdcSandboxConsignment } from '../order-shipping/dtdcSandbox.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'A verified admin session is required.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: identity, error: authError } = await client.auth.getUser();
  if (authError || !identity.user?.email_confirmed_at || identity.user.is_anonymous) {
    return json({ error: 'A verified admin session is required.' }, 401);
  }
  const { data: permitted, error: permissionError } = await client.rpc('is_catalogue_admin');
  if (permissionError || permitted !== true) return json({ error: 'Recent admin authenticator verification required.' }, 403);
  if (Deno.env.get('DTDC_SANDBOX_ENABLED') !== 'true') return json({ error: 'DTDC sandbox is not enabled.' }, 503);
  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'Invalid request.' }, 400);
    body = value as Record<string, unknown>;
  } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!['list', 'book', 'track', 'label', 'clear'].includes(String(body.action))) {
    return json({ error: 'Invalid DTDC sandbox action.' }, 400);
  }
  if (['track', 'label', 'clear'].includes(String(body.action)) && !uuid(body.id)) return json({ error: 'Invalid test booking.' }, 400);
  if (['book', 'clear'].includes(String(body.action)) && body.confirmed !== true) {
    return json({ error: 'Explicit confirmation is required.' }, 400);
  }
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const bookings = () => db.from('dtdc_sandbox_bookings');
  try {
    if (body.action === 'list') {
      const { data, error } = await bookings().select('id,customer_reference,state,awb,created_at')
        .order('created_at', { ascending: false }).limit(20);
      if (error) throw new Error('Unable to load DTDC sandbox bookings.');
      return json({ bookings: data });
    }
    if (body.action === 'clear') {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await bookings().update({ state: 'cleared', updated_at: new Date().toISOString() })
        .eq('id', body.id).in('state', ['pending', 'review']).lt('created_at', cutoff).select('id').maybeSingle();
      if (error) throw new Error('Unable to clear the sandbox booking.');
      if (!data) return json({ error: 'No eligible booking to clear. Wait five minutes and refresh.' }, 409);
      return json({ cleared: true });
    }
    const apiKey = Deno.env.get('DTDC_SANDBOX_API_KEY')?.trim();
    const trackingToken = Deno.env.get('DTDC_SANDBOX_TRACKING_TOKEN')?.trim();
    const customerCode = Deno.env.get('DTDC_SANDBOX_CUSTOMER_CODE')?.trim();
    const serviceType = Deno.env.get('DTDC_SANDBOX_SERVICE_TYPE')?.trim();
    if (!apiKey || !trackingToken || !customerCode || !serviceType) {
      return json({ error: 'DTDC sandbox credentials, customer code and service type are not configured.' }, 503);
    }
    const api = createDtdcSandboxClient(apiKey, trackingToken);
    if (body.action === 'book') {
      const id = crypto.randomUUID();
      const customerReference = `LUVIA-TEST-${id}`;
      const { error: claimError } = await bookings().insert({ id, customer_reference: customerReference,
        actor_id: identity.user.id, state: 'pending' });
      if (claimError) return json({ error: 'Could not reserve a test booking. Refresh and reconcile any unresolved booking first.' }, 409);
      const address = { name: 'Sandbox Test', phone: '9999999999', address_line_1: 'Test address',
        pincode: '110001', city: 'New Delhi', state: 'Delhi' };
      const shipment: DtdcSandboxConsignment = { customer_code: customerCode, service_type_id: serviceType,
        load_type: 'NON-DOCUMENT', consignment_type: 'Forward', description: 'Sandbox test parcel',
        commodity_id: '7', dimension_unit: 'cm', length: '10', width: '10', height: '10',
        weight_unit: 'kg', weight: '0.5', declared_value: '100', num_pieces: '1',
        origin_details: address, destination_details: address,
        customer_reference_number: customerReference };
      let awb: string;
      try {
        awb = await api.book(shipment);
      } catch (failure) {
        const { error } = await bookings().update({ state: 'review', updated_at: new Date().toISOString() })
          .eq('id', id).eq('state', 'pending');
        if (error) return json({ error: 'Booking outcome is unknown and could not be updated. Refresh and check DTDC before retrying.' }, 502);
        if (failure instanceof DtdcBookingError) return json({ error: failure.message }, 502);
        return json({ error: 'Booking outcome is unknown. Refresh and check DTDC before retrying.' }, 502);
      }
      const { data, error } = await bookings().update({ state: 'booked', awb, updated_at: new Date().toISOString() })
        .eq('id', id).eq('state', 'pending').select('id').maybeSingle();
      if (error || !data) return json({ error: 'DTDC returned an AWB, but saving it failed. Refresh and check DTDC before retrying.' }, 502);
      return json({ id, awb });
    }
    const { data: booking, error: readError } = await bookings().select('awb,state').eq('id', body.id).maybeSingle();
    if (readError) throw new Error('Unable to load the sandbox booking.');
    if (!booking || booking.state !== 'booked' || !booking.awb) return json({ error: 'Confirmed sandbox booking not found.' }, 404);
    if (body.action === 'track') return json({ status: await api.track(booking.awb) });
    const pdf = await api.label(booking.awb);
    let binary = '';
    for (let offset = 0; offset < pdf.length; offset += 8192) {
      binary += String.fromCharCode(...pdf.subarray(offset, offset + 8192));
    }
    return json({ pdf: btoa(binary) });
  } catch (failure) {
    return json({ error: failure instanceof Error ? failure.message : 'DTDC sandbox request failed.' }, 502);
  }
});
