import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async request => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405, headers });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response('Invalid testimonial reference.', { status: 400, headers });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return new Response('Photo service is not configured.', { status: 503, headers });
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('customer_love_photo', { testimonial_id: id, admin_view: false });
  if (error || (data !== null && typeof data !== 'string')) {
    console.error('Unable to load published testimonial photo:', error?.message ?? 'Invalid response');
    return new Response('Unable to load photo.', { status: 503, headers });
  }
  if (!data) return new Response('Photo not available.', { status: 404, headers });
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  return new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/webp' } });
});
