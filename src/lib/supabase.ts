import { createClient } from '@supabase/supabase-js';
import { trackEvent } from '../services/analytics';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let signupLink = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'email_change';
if (supabase && signupLink) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return;
    if (!signupLink || !session?.user.email_confirmed_at || session.user.is_anonymous) return;
    signupLink = false;
    trackEvent('sign_up', { method: 'email_password' });
  });
}
