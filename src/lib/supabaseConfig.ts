import type { SupabaseClient } from '@supabase/supabase-js';
import { clearChunkFailureRetry } from '../utils/chunkLoadRecovery';
import { retryImport } from '../utils/retryImport';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// The Supabase client is loaded on demand so it stays out of the initial
// public bundle; the first catalogue data comes from catalogue-prefetch.js.
let supabasePromise: Promise<SupabaseClient | null> | null = null;

export const loadSupabase = (): Promise<SupabaseClient | null> => {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (supabasePromise) return supabasePromise;
  supabasePromise = retryImport(() => import('./supabase')).then((module) => {
    clearChunkFailureRetry();
    return module.supabase;
  }).catch((error: unknown) => {
    supabasePromise = null;
    throw error;
  });
  return supabasePromise;
};

export async function loadPasswordVerifier(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) throw new Error('Password changes require an online connection.');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
