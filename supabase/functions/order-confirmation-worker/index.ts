import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOrderEmail } from '../_shared/orderEmail.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('CUSTOMER_WELCOME_WORKER_SECRET');
  if (!secret) return json({ error: 'Order worker is not configured.' }, 503);
  const supplied = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference) return json({ error: 'Worker authentication required.' }, 401);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('WELCOME_COUPON_FROM_EMAIL');
  if (!apiKey || !sender) return json({ error: 'Order email provider is not configured; messages remain queued.' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const { data: jobs, error } = await admin.rpc('claim_order_confirmation_emails');
  if (error || !jobs) {
    console.error('Unable to claim order emails:', error?.message);
    return json({ error: 'Unable to claim order emails.' }, 500);
  }
  let accepted = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const { data: order, error: orderError } = await admin.from('payment_orders')
        .select('reference,status,is_live_checkout,customer_name,customer_contact,customer_email,delivery_details,subtotal_paise,discount_paise,shipping_paise,total_paise,payment_order_items(product_name,variant_name,product_public_slug,image_url,quantity,line_total_paise)')
        .eq('id', job.order_id).single();
      if (orderError || !order) throw new Error(orderError?.message ?? 'Order not found.');
      const providerId = await sendOrderEmail(job, order, apiKey, sender);
      const { error: saveError } = await admin.from('order_confirmation_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null }).eq('id', job.id);
      if (saveError) throw new Error(`Unable to record order email acceptance: ${saveError.message}`);
      accepted++;
    } catch (failure) {
      failed++;
      const message = failure instanceof Error ? failure.message : 'Order email failed.';
      console.error('Order confirmation delivery failed:', message);
      const { error: saveError } = await admin.from('order_confirmation_emails')
        .update({ last_error: message.slice(0, 500) }).eq('id', job.id);
      if (saveError) console.error('Unable to record order email failure:', saveError.message);
    }
  }
  return json({ accepted, failed }, failed ? 502 : 200);
});
