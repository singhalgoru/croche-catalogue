import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  const url = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: identity, error: authError } = await client.auth.getUser();
  if (authError || !identity.user || !identity.user.email_confirmed_at || identity.user.is_anonymous) {
    return json({ error: 'A verified admin session is required.' }, 401);
  }
  const { data: permitted, error: permissionError } = await client.rpc('is_catalogue_admin');
  if (permissionError || permitted !== true) {
    return json({ error: 'Recent admin authenticator verification is required. Return to admin sign in.' }, 403);
  }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: directory, error: directoryError } = await admin.rpc('admin_user_directory', { actor: identity.user.id });
  if (directoryError || !directory) return json({ error: 'Catalogue admin access required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body.' }, 400);
  const action = body.action;
  if (action === 'list') return json(directory);
  const customerAction = action === 'suspend-customer' || action === 'restore-customer';
  if (!['add','edit','remove','password','suspend-customer','restore-customer'].includes(String(action))) return json({ error: 'Invalid admin action.' }, 400);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (customerAction && (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
    || reason.length < 5 || reason.length > 300)) {
    return json({ error: 'Choose a registered customer and enter a reason of 5–300 characters.' }, 400);
  }
  const target = typeof body.id === 'string' ? directory.users.find((user: { id: string }) => user.id === body.id) : null;
  if (customerAction && (target || body.id === identity.user.id)) return json({ error: 'Admin accounts cannot be disabled from customer management.' }, 400);
  if (!customerAction && action !== 'add' && !target) return json({ error: 'Admin user not found.' }, 404);
  if (!customerAction && !directory.isOwner && !(action === 'password' && target?.id === identity.user.id)) {
    return json({ error: 'Only the owner can manage other admins.' }, 403);
  }
  if (action === 'remove' && target.isOwner) return json({ error: 'Owner access cannot be removed.' }, 400);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if ((action === 'add' || action === 'edit') && (!name || name.length > 80)) {
    return json({ error: 'Enter an admin name of at most 80 characters.' }, 400);
  }
  if (action === 'add' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    return json({ error: 'Enter a valid admin email.' }, 400);
  }
  if (action === 'password' && (password.length < 12 || password.length > 128
    || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))) {
    return json({ error: 'Use 12–128 characters with uppercase, lowercase and a number.' }, 400);
  }
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
    return json({ error: 'Enter your current password to authorize this change.' }, 400);
  }
  const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: verified, error: verificationError } = await verifier.auth.signInWithPassword({
    email: identity.user.email!, password: body.currentPassword,
    ...(typeof body.captchaToken === 'string' ? { options: { captchaToken: body.captchaToken } } : {}),
  });
  if (verificationError || verified.user?.id !== identity.user.id) {
    return json({ error: verificationError?.message ?? 'Unable to verify your current password.' }, 401);
  }
  const { error: signOutError } = await verifier.auth.signOut({ scope: 'local' });
  if (signOutError) return json({ error: 'Unable to close the authorization session. Retry.' }, 500);
  try {
    const { data: stillPermitted, error: latestPermissionError } = await client.rpc('is_catalogue_admin');
    if (latestPermissionError || stillPermitted !== true) return json({ error: 'Admin verification expired or access was locked. Verify again before retrying.' }, 403);
    const { data: latest, error: accessError } = await admin.rpc('admin_user_directory', { actor: identity.user.id });
    if (accessError || !latest || (!customerAction && !latest.isOwner && !(action === 'password' && target?.id === identity.user.id))
      || (!customerAction && action !== 'add' && !latest.users.some((user: { id: string }) => user.id === target.id))) {
      return json({ error: 'Admin access changed. Refresh accounts before retrying.' }, 403);
    }
    if (customerAction) {
      const { data: candidate, error: candidateError } = await admin.rpc('customer_account_candidate', { actor: identity.user.id, target: body.id });
      if (candidateError || !candidate || candidate.id !== body.id) throw new Error(candidateError?.message ?? 'Registered customer account not found.');
      const { error: updateError } = await admin.auth.admin.updateUserById(candidate.id,
        { ban_duration: action === 'suspend-customer' ? '876000h' : 'none' });
      if (updateError) throw new Error(updateError.message);
      const { error: auditError } = await admin.from('customer_account_audit')
        .insert({ actor_id: identity.user.id, target_id: candidate.id, action: action === 'suspend-customer' ? 'suspend' : 'restore', reason });
      if (auditError) throw new Error(`Account access updated, but audit recording failed: ${auditError.message}. Refresh before retrying.`);
      return json({ message: action === 'suspend-customer'
        ? 'Customer account temporarily disabled until an admin re-enables it. Existing account data and orders are preserved.'
        : 'Customer account re-enabled. The customer can sign in or request a password reset.' });
    }
    if (action === 'add') {
      const { data: existingId, error: lookupError } = await admin.rpc('find_admin_candidate', { actor: identity.user.id, account_email: email });
      if (lookupError) throw new Error(lookupError.message);
      let id = existingId;
      if (!id) {
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name }, redirectTo: 'https://luviacreations.com/',
        });
        if (inviteError || !invited.user) throw new Error(inviteError?.message ?? 'No invitation account returned.');
        id = invited.user.id;
      } else {
        const { data: account, error: accountError } = await admin.auth.admin.getUserById(id);
        if (accountError) throw new Error(accountError.message);
        if (!account.user?.email_confirmed_at) throw new Error('Existing account must verify its email before receiving admin access.');
      }
      const { error } = await admin.rpc('manage_admin_membership', { actor: identity.user.id, target: id, grant_access: true });
      if (error) throw new Error(`Account exists, but admin access was not granted: ${error.message}. Refresh before retrying.`);
      return json({ message: existingId ? 'Existing verified account granted admin access. Its login details are unchanged.'
        : 'Admin invitation sent. The recipient must open it and set a password. Email acceptance does not guarantee inbox delivery.' });
    }
    if (action === 'remove') {
      const { error } = await admin.rpc('manage_admin_membership', { actor: identity.user.id, target: target.id, grant_access: false });
      if (error) throw new Error(error.message);
      return json({ message: 'Admin access removed. Account and historical records are preserved.' });
    }
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(target.id);
    if (accountError || !account.user) throw new Error(accountError?.message ?? 'Admin account not found.');
    const { error: updateError } = await admin.auth.admin.updateUserById(target.id,
      action === 'password' ? { password } : { user_metadata: { ...account.user.user_metadata, full_name: name } });
    if (updateError) throw new Error(updateError.message);
    const { error: auditError } = await admin.from('admin_user_audit')
      .insert({ actor_id: identity.user.id, target_id: target.id, action });
    if (auditError) throw new Error(`Account updated, but audit recording failed: ${auditError.message}. Refresh before retrying.`);
    return json({ message: action === 'password' ? 'Password changed. Use the new password on your next sign-in.' : 'Admin name updated.' });
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'Admin account operation failed.';
    console.error('Admin management failed:', message);
    return json({ error: message }, 400);
  }
});
