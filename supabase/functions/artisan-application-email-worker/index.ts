import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendArtisanApplicationEmail, type ArtisanApplicationEmailJob } from '../_shared/artisanApplicationEmail.ts';
import { isProductPatternEmailJob, sendProductPatternEmail } from '../_shared/productPatternEmail.ts';
import { isWorkEmailJob, sendArtisanWorkEmail } from '../_shared/artisanWorkEmail.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isJob(value: unknown): value is ArtisanApplicationEmailJob {
  const isKind = isRecord(value) && (value.kind === 'submitted' || value.kind === 'Trial' || value.kind === 'Approved'
    || value.kind === 'Declined' || value.kind === 'More information required' || value.kind === 'Payment details required');
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
    && (value.kind !== 'Payment details required' || (typeof payload.payment_token === 'string'
      && /^[a-f0-9]{64}$/.test(payload.payment_token) && typeof payload.payment_expires_at === 'string'
      && Date.parse(payload.payment_expires_at) > Date.now()))
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
        const expiredPayment = candidate.kind === 'Payment details required' && isRecord(candidate.payload)
          && typeof candidate.payload.payment_expires_at === 'string'
          && Date.parse(candidate.payload.payment_expires_at) <= Date.now();
        const { error: saveError } = await admin.from('artisan_application_emails')
          .update(expiredPayment ? { last_error: 'Payment request expired before sending.',attempts: 8,
            payload: { ...candidate.payload, payment_token: '' } } : { last_error: 'Invalid queued artisan email job.' }).eq('id', candidate.id);
        if (saveError) console.error('Unable to record invalid artisan email job.');
      }
      continue;
    }
    try {
      const providerId = await sendArtisanApplicationEmail(candidate, apiKey);
      const { data: saved, error: saveError } = await admin.from('artisan_application_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null,
          ...(candidate.kind === 'Payment details required'
            ? { payload: { ...candidate.payload, payment_token: '' } } : {}) })
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
  const { data: patternJobs, error: patternError } = await admin.rpc('claim_product_pattern_emails');
  if (patternError || !Array.isArray(patternJobs)) {
    console.error('Unable to claim product pattern emails:', patternError?.message);
    return json({ accepted, failed, error: 'Unable to claim product pattern emails.' }, 500);
  }
  await Promise.all(patternJobs.map(async candidate => {
    try {
      if (!isProductPatternEmailJob(candidate)) throw new Error('Invalid queued product pattern email.');
      const providerId = await sendProductPatternEmail(candidate, apiKey);
      const { data: saved, error: saveError } = await admin.from('product_pattern_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null, content: null })
        .eq('id', candidate.id).select('id').single();
      if (saveError || saved?.id !== candidate.id) {
        throw new Error('Unable to record pattern email acceptance; retry will use the same provider idempotency key.');
      }
      accepted++;
    } catch (failure) {
      failed++;
      const message = failure instanceof Error ? failure.message : 'Pattern email failed.';
      console.error('Product pattern email failed:', isRecord(candidate) ? candidate.id : 'invalid job', message);
      if (isRecord(candidate) && typeof candidate.id === 'string') {
        const { error: saveError } = await admin.from('product_pattern_emails')
          .update({ last_error: message.slice(0, 500) }).eq('id', candidate.id);
        if (saveError) console.error('Unable to record pattern email failure:', candidate.id, saveError.message);
      }
    }
  }));
  const { data: workJobs, error: workError } = await admin.rpc('claim_artisan_work_emails');
  if (workError || !Array.isArray(workJobs)) {
    console.error('Unable to claim artisan work emails:', workError?.message);
    return json({ accepted, failed, error: 'Unable to claim artisan work emails.' }, 500);
  }
  for (const candidate of workJobs) {
    try {
      if (!isWorkEmailJob(candidate)) throw new Error('Invalid queued work assignment email.');
      const providerId = await sendArtisanWorkEmail(candidate, apiKey);
      const { data: saved, error: saveError } = await admin.from('artisan_work_emails')
        .update({ accepted_at: new Date().toISOString(), provider_id: providerId, last_error: null, token: null })
        .eq('assignment_id', candidate.id).eq('kind', candidate.kind).select('assignment_id').single();
      if (saveError || saved?.assignment_id !== candidate.id) {
        throw new Error('Unable to record email acceptance; retry will use the same provider idempotency key.');
      }
      if (candidate.kind === 'offer') {
        const { error: deleteError } = await admin.from('artisan_work_attachments').delete().eq('assignment_id', candidate.id);
        if (deleteError) console.error('Unable to clear sent assignment attachments:', candidate.id, deleteError.message);
      }
      accepted++;
    } catch (failure) {
      failed++;
      const message = failure instanceof Error ? failure.message : 'Work assignment email failed.';
      console.error('Artisan work email failed:', isRecord(candidate) ? candidate.id : 'invalid job', message);
      if (isRecord(candidate) && typeof candidate.id === 'string'
        && (candidate.kind === 'offer' || candidate.kind === 'acceptance')) {
        const { error: saveError } = await admin.from('artisan_work_emails')
          .update({ last_error: message.slice(0, 500) }).eq('assignment_id', candidate.id).eq('kind', candidate.kind);
        if (saveError) console.error('Unable to record work email failure:', candidate.id, saveError.message);
      }
    }
  }
  return json({ accepted, failed }, failed ? 502 : 200);
});
