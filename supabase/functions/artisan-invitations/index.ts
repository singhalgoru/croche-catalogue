import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendArtisanInvitationEmail } from '../_shared/artisanInvitationEmail.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in as admin first.' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: identity, error: authError } = await client.auth.getUser();
  if (authError || !identity.user || !identity.user.email_confirmed_at || identity.user.is_anonymous) {
    return json({ error: 'A verified admin account is required.' }, 401);
  }
  const { data: permitted, error: permissionError } = await client.rpc('is_catalogue_admin');
  if (permissionError || permitted !== true) return json({ error: 'Recent admin authenticator verification is required.' }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'Invitation request is too large.' }, 400);
    body = JSON.parse(raw);
  } catch { return json({ error: 'Invalid invitation request.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)
    || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)
    || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100
    || (body.channel !== 'email' && body.channel !== 'whatsapp')
    || typeof body.contact !== 'string' || body.contact.length > 254
    || (body.channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact.trim()))
    || (body.channel === 'whatsapp' && !/^(?:\+?91[\s-]?)?[6-9]\d{9}$/.test(body.contact.trim()))) {
    return json({ error: 'Enter a name and a valid invitation email or Indian WhatsApp number.' }, 400);
  }
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (body.channel === 'email' && !apiKey) return json({ error: 'Onboarding email is not configured. No email was sent.' }, 503);
  const { data: invitation, error } = await client.rpc('create_artisan_invitation', {
    invitation_id: body.id, invitation_token: body.token, recipient_name: body.name,
    delivery_channel: body.channel, recipient_contact: body.contact,
  });
  if (error || !invitation) return json({ error: error?.message ?? 'Unable to save invitation.' }, 400);
  const link = `https://luviacreations.com/artisans/#invite=${body.token}`;
  if (body.channel === 'whatsapp') return json({ link, message: 'Invitation created. Open WhatsApp and send the prepared message, or copy the link. Nothing has been sent automatically.' });
  if (invitation.provider_id) return json({ link, message: 'This invitation email was already accepted by the email provider. Inbox delivery is not guaranteed.' });
  try {
    const providerId = await sendArtisanInvitationEmail(invitation, link, apiKey!);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: recorded, error: recordError } = await admin.from('artisan_invitations')
      .update({ provider_id: providerId, email_accepted_at: new Date().toISOString() })
      .eq('id', invitation.id).select('id').single();
    if (recordError || recorded?.id !== invitation.id) {
      return json({ error: 'Email accepted by the provider, but confirmation could not be saved. Retry this same invitation; do not create a replacement.' }, 502);
    }
    return json({ link, message: 'Invitation email accepted by the provider from onboarding@luviacreations.com. Ask the artisan to check their inbox and spam folder; inbox delivery is not guaranteed.' });
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'Invitation email failed. Retry this same invitation.';
    console.error('Artisan invitation email failed:', message);
    return json({ error: message }, 502);
  }
});
