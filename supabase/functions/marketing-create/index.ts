import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadMetaAccess } from '../_shared/loadMetaAccess.ts';
import {
  buildPlan, completePausedAd, createPausedObjects, creationSettings, isRecord, parseCreationInput, preflight, resolveLocations,
} from './meta.ts';
import { parseRecoveryInput, recoverySnapshot, verifyRecovery } from './recovery.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const columns = 'draft_id,status,account_id,campaign_id,adset_id,creative_id,ad_id,error,recovery_started_at';

export async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication is required.' }, 401);
  const env = (name: string) => Deno.env.get(name);
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) return json({ error: 'Supabase function environment is incomplete.' }, 500);
  const auth = createClient(url, anon, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: user, error: userError } = await auth.auth.getUser();
  if (userError || !user.user) return json({ error: 'Authentication is required.' }, 401);
  const { data: admin, error: adminError } = await auth.rpc('is_catalogue_admin');
  if (adminError) return json({ error: 'Unable to verify admin access.' }, 500);
  if (!admin) return json({ error: 'Fresh admin verification is required to create paused campaigns.' }, 403);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON request.' }, 400); }
  const setup = isRecord(payload) && payload.action === 'setup' && Object.keys(payload).length === 1;
  let recovery;
  if (isRecord(payload) && (payload.action === 'review-recovery' || payload.action === 'recover')) {
    try { recovery = parseRecoveryInput(payload); } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid recovery request.' }, 400);
    }
  }
  let input;
  if (!setup && !recovery) {
    try { input = parseCreationInput(payload); } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid creation request.' }, 400);
    }
  }
  const service = createClient(url, key, { auth: { persistSession: false } });
  if (input) {
    const { data, error } = await service.from('marketing_meta_creations').select(columns).eq('draft_id', input.draftId).maybeSingle();
    if (error) return json({ error: 'Unable to read the Meta creation ledger. No new request was sent.' }, 500);
    if (data) return json({ creation: data });
  }
  let settings;
  let config;
  try {
    settings = creationSettings(env);
    ({ config } = await loadMetaAccess(env));
  } catch (error) {
    console.error('Paused Meta creation configuration failed.');
    return json({ error: error instanceof Error ? error.message : 'Meta configuration failed.' }, 503);
  }
  if (setup) {
    try {
      return json({ setup: { ...await preflight(config, settings, false), pixelId: settings.pixelId ?? null } });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Meta preflight failed.' }, 502);
    }
  }
  if (recovery) {
    const { data: existing, error: existingError } = await service.from('marketing_meta_creations')
      .select(`${columns},request,updated_at`).eq('draft_id', recovery.draftId).maybeSingle();
    if (existingError) return json({ error: 'Unable to read the saved creation attempt.' }, 500);
    if (!existing || !isRecord(existing.request) || typeof existing.request.productId !== 'string') {
      return json({ error: 'No recoverable saved creation request was found.' }, 409);
    }
    const { data: savedDraft, error: savedDraftError } = await service.from('marketing_campaign_drafts')
      .select('status,proposal').eq('id', recovery.draftId).maybeSingle();
    if (savedDraftError) return json({ error: 'Unable to read the approved proposal.' }, 500);
    const { data: savedProduct, error: savedProductError } = await service.from('products')
      .select('id,published,image_url').eq('id', existing.request.productId).maybeSingle();
    if (savedProductError) return json({ error: 'Unable to verify the saved product image.' }, 500);
    let saved;
    try {
      saved = recoverySnapshot(existing, savedDraft, savedProduct, config, settings);
      await verifyRecovery(config, settings, saved);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Recovery verification failed.' }, 409);
    }
    if (recovery.action === 'review-recovery') {
      return json({ recovery: {
        accountId: config.accountId, pageId: settings.pageId, campaignId: saved.campaignId,
        adsetId: saved.adsetId, plan: saved.plan,
        locationLabel: saved.input.locations === null ? 'India' : saved.input.locations.map(item => item.label).join('; '),
      } });
    }
    const { data: claim, error: claimError } = await service.from('marketing_meta_creations')
      .update({
        status: 'creating', error: null, recovery_started_at: new Date().toISOString(),
        recovery_requested_by: user.user.id, updated_at: new Date().toISOString(),
      })
      .eq('draft_id', recovery.draftId).eq('status', 'needs_attention').eq('error', existing.error)
      .eq('updated_at', existing.updated_at)
      .is('recovery_started_at', null).select(columns).maybeSingle();
    if (claimError || !claim) return json({ error: 'Recovery was already claimed or could not be reserved. Refresh status; no recovery writes were sent.' }, 409);
    const checkpoint = async (updates: Record<string, string>) => {
      const { data, error } = await service.from('marketing_meta_creations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('draft_id', recovery.draftId).select(columns).single();
      if (error || !data) throw new Error('Unable to persist Meta recovery progress. Do not retry; inspect Ads Manager.');
      return data;
    };
    try {
      // Recheck after the atomic claim; never POST if objects changed during review.
      await verifyRecovery(config, settings, saved);
      await completePausedAd(config, settings, saved.plan, saved.campaignId, saved.adsetId, checkpoint);
      return json({ creation: await checkpoint({ status: 'created' }) });
    } catch (error) {
      console.error('Paused Meta recovery requires attention.');
      try {
        return json({ creation: await checkpoint({
          status: 'needs_attention', error: error instanceof Error ? error.message : 'Meta recovery failed. Do not retry.',
        }) });
      } catch {
        return json({ error: 'Recovery progress could not be saved. Do not retry; inspect Ads Manager and the ledger.' }, 500);
      }
    }
  }
  if (!input) return json({ error: 'Invalid creation request.' }, 400);
  const { data: draft, error: draftError } = await service.from('marketing_campaign_drafts')
    .select('status,proposal').eq('id', input.draftId).maybeSingle();
  if (draftError) return json({ error: 'Unable to read the saved proposal.' }, 500);
  if (!draft || draft.status !== 'approved') return json({ error: 'Only an internally approved saved proposal can be sent to Meta.' }, 409);
  const { data: product, error: productError } = await service.from('products')
    .select('id,published,image_url').eq('id', input.productId).maybeSingle();
  if (productError) return json({ error: 'Unable to read the published product image.' }, 500);
  let plan;
  try { plan = buildPlan(draft, product, input, settings.pixelId); } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid saved proposal.' }, 400);
  }
  let geo;
  try {
    await preflight(config, settings, plan.goal === 'sales');
    geo = await resolveLocations(config, input.locations);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Meta preflight failed.' }, 502);
  }
  const { data: claim, error: claimError } = await service.from('marketing_meta_creations').insert({
    draft_id: input.draftId, account_id: config.accountId, requested_by: user.user.id,
    request: { ...input, plan, geo, pageId: settings.pageId, pixelId: settings.pixelId ?? null },
  }).select(columns).single();
  if (claimError || !claim) {
    return json({ error: claimError?.code === '23505'
      ? 'This proposal already has a creation attempt. Reload its status; do not resubmit.'
      : 'Unable to reserve the creation attempt. No Meta writes were sent.' }, 409);
  }
  const checkpoint = async (updates: Record<string, string>) => {
    const { data, error } = await service.from('marketing_meta_creations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('draft_id', input.draftId).select(columns).single();
    if (error || !data) throw new Error('Unable to persist Meta creation progress. Inspect Ads Manager before recovery.');
    return data;
  };
  try {
    await createPausedObjects(config, settings, plan, geo, checkpoint);
    return json({ creation: await checkpoint({ status: 'created' }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta creation failed. Inspect Ads Manager before recovery.';
    console.error('Paused Meta creation requires attention.');
    try {
      return json({ creation: await checkpoint({ status: 'needs_attention', error: message }) });
    } catch {
      return json({ error: 'Creation progress could not be saved. Do not retry; inspect Ads Manager and the creation ledger.' }, 500);
    }
  }
}

Deno.serve(handler);
