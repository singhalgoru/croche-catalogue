import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWelcomeEmail } from '../_shared/welcomeEmail.ts';
import { fetchWelcomeProducts } from '../_shared/welcomeProducts.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('CUSTOMER_WELCOME_WORKER_SECRET');
  if (!secret) return json({ error: 'Welcome worker is not configured.' }, 503);
  const supplied = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference) return json({ error: 'Worker authentication required.' }, 401);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('WELCOME_COUPON_FROM_EMAIL');
  if (!apiKey || !sender) return json({ error: 'Welcome email provider is not configured; messages remain queued.' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const { data: jobs, error } = await admin.rpc('claim_customer_welcome_emails');
  if (error || !jobs) {
    console.error('Unable to claim welcome emails:', error?.message);
    return json({ error: 'Unable to claim welcome emails.' }, 500);
  }
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const { data: coupon, error: claimError } = await admin.rpc('claim_welcome_coupon', { owner_id: job.user_id });
      if (claimError || !coupon) throw new Error(claimError?.message ?? 'No eligible welcome coupon returned.');
      if (!coupon.email_sent_at) {
        await sendWelcomeEmail(coupon, apiKey, sender, await fetchWelcomeProducts(admin));
        const { error: saveError } = await admin.from('welcome_coupons')
          .update({ email_sent_at: new Date().toISOString() }).eq('id', coupon.id);
        if (saveError) throw new Error(`Unable to record email acceptance: ${saveError.message}`);
      }
      const { error: completeError } = await admin.from('customer_welcome_emails')
        .update({ sent_at: new Date().toISOString(), last_error: null }).eq('user_id', job.user_id);
      if (completeError) throw new Error(`Unable to complete email job: ${completeError.message}`);
      sent++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : 'Welcome email failed.';
      console.error('Customer welcome delivery failed:', message);
      const { error: saveError } = await admin.from('customer_welcome_emails')
        .update({ last_error: message.slice(0, 500) }).eq('user_id', job.user_id);
      if (saveError) console.error('Unable to record welcome email failure:', saveError.message);
    }
  }
  return json({ sent, failed }, failed ? 502 : 200);
});
