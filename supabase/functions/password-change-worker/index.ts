import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPasswordChangeEmail } from '../_shared/passwordChangeEmail.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('CUSTOMER_WELCOME_WORKER_SECRET');
  if (!secret) return json({ error: 'Password notification worker is not configured.' }, 503);
  const supplied = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference) return json({ error: 'Worker authentication required.' }, 401);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Password email provider is not configured; messages remain queued.' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const { data: jobs, error } = await admin.rpc('claim_password_change_emails');
  if (error || !Array.isArray(jobs)) {
    console.error('Unable to claim password notifications:', error?.message);
    return json({ error: 'Unable to claim password notifications.' }, 500);
  }
  let accepted = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const providerId = await sendPasswordChangeEmail(job, apiKey);
      const { error: saveError } = await admin.from('password_change_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null }).eq('id', job.id);
      if (saveError) throw new Error(`Unable to record password email acceptance: ${saveError.message}`);
      accepted++;
    } catch (failure) {
      failed++;
      const message = failure instanceof Error ? failure.message : 'Password notification failed.';
      console.error('Password notification delivery failed:', message);
      const { error: saveError } = await admin.from('password_change_emails')
        .update({ last_error: message.slice(0, 500) }).eq('id', job.id);
      if (saveError) console.error('Unable to record password email failure:', saveError.message);
    }
  }
  return json({ accepted, failed }, failed ? 502 : 200);
});
