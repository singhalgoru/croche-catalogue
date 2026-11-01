import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendArtisanApplicationEmail, type ArtisanApplicationEmailJob } from '../_shared/artisanApplicationEmail.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isJob(value: unknown): value is ArtisanApplicationEmailJob {
  const isKind = isRecord(value) && (value.kind === 'submitted' || value.kind === 'Approved'
    || value.kind === 'Declined' || value.kind === 'More information required');
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id)
    || !isKind
    || typeof value.recipient_email !== 'string' || !emailPattern.test(value.recipient_email)
    || !isRecord(value.payload)) return false;
  const { payload } = value;
  const validApplicantEmail = typeof payload.applicant_email === 'string'
    && (value.kind === 'submitted' ? payload.applicant_email === '' || emailPattern.test(payload.applicant_email)
      : emailPattern.test(payload.applicant_email));
  if (typeof payload.application_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.application_id)
    || typeof payload.applicant_name !== 'string' || !payload.applicant_name.trim() || payload.applicant_name.length > 100
    || !validApplicantEmail
    || typeof payload.mobile !== 'string' || payload.mobile.length > 20
    || typeof payload.city !== 'string' || payload.city.length > 100
    || typeof payload.state !== 'string' || payload.state.length > 100
    || typeof payload.skills !== 'string' || payload.skills.length > 1000
    || typeof payload.availability !== 'string' || payload.availability.length > 500
    || typeof payload.message !== 'string' || payload.message.length > 1500) return false;
  if (value.kind === 'submitted') return value.recipient_email === 'info@luviacreations.com';
  return value.recipient_email === payload.applicant_email
    && (value.kind !== 'More information required' || Boolean(payload.message.trim()));
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('CUSTOMER_WELCOME_WORKER_SECRET');
  if (!secret) return json({ error: 'Artisan email worker is not configured.' }, 503);
  const supplied = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference) return json({ error: 'Worker authentication required.' }, 401);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Artisan email provider is not configured; messages remain queued.' }, 503);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Artisan email database access is not configured.' }, 503);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: jobs, error } = await admin.rpc('claim_artisan_application_emails');
  if (error || !Array.isArray(jobs)) {
    console.error('Unable to claim artisan application emails:', error?.message);
    return json({ error: 'Unable to claim artisan application emails.' }, 500);
  }
  let accepted = 0;
  let failed = 0;
  for (const candidate of jobs) {
    if (!isJob(candidate)) {
      failed++;
      if (isRecord(candidate) && typeof candidate.id === 'string') {
        const { error: saveError } = await admin.from('artisan_application_emails')
          .update({ last_error: 'Invalid queued artisan email job.' }).eq('id', candidate.id);
        if (saveError) console.error('Unable to record invalid artisan email job.');
      }
      continue;
    }
    try {
      const providerId = await sendArtisanApplicationEmail(candidate, apiKey);
      const { data: saved, error: saveError } = await admin.from('artisan_application_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null })
        .eq('id', candidate.id).select('id').single();
      if (saveError || saved?.id !== candidate.id) {
        throw new Error(`Unable to record email provider acceptance: ${saveError?.message ?? 'job receipt mismatch'}`);
      }
      accepted++;
    } catch (failure) {
      failed++;
      const message = failure instanceof Error ? failure.message : 'Artisan email delivery failed.';
      console.error('Artisan application email delivery failed:', candidate.id, message);
      const { error: saveError } = await admin.from('artisan_application_emails')
        .update({ last_error: message.slice(0, 500) }).eq('id', candidate.id);
      if (saveError) console.error('Unable to record artisan email failure:', candidate.id, saveError.message);
    }
  }
  return json({ accepted, failed }, failed ? 502 : 200);
});
