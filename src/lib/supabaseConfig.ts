import type { SupabaseClient } from '@supabase/supabase-js';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// The Supabase client is loaded on demand so it stays out of the initial
// public bundle; the first catalogue data comes from catalogue-prefetch.js.
export const loadSupabase = (): Promise<SupabaseClient | null> =>
  isSupabaseConfigured ? import('./supabase').then((module) => module.supabase) : Promise.resolve(null);
