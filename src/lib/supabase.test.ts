import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { subscribe, trackEvent } = vi.hoisted(() => ({ subscribe: vi.fn(), trackEvent: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { onAuthStateChange: subscribe } }) }));
vi.mock('../services/analytics', () => ({ trackEvent }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fixture');
  history.replaceState(null, '', '/#access_token=private&type=email_change');
});
afterEach(() => { vi.unstubAllEnvs(); history.replaceState(null, '', '/'); });
it('tracks a verified activation link once, not a restored or anonymous session', async () => {
  await import('./supabase');
  const callback = subscribe.mock.calls[0][0];
  const session = { user: { email_confirmed_at: '2026-10-11', is_anonymous: false } };
  callback('INITIAL_SESSION', session);
  callback('SIGNED_IN', { user: { email_confirmed_at: null, is_anonymous: true } });
  expect(trackEvent).not.toHaveBeenCalled();
  callback('SIGNED_IN', session);
  callback('USER_UPDATED', session);
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith('sign_up', { method: 'email_password' });
});
it('does not interpret password recovery or ordinary login as signup', async () => {
  history.replaceState(null, '', '/#access_token=private&type=recovery');
  await import('./supabase');
  expect(subscribe).not.toHaveBeenCalled();
});
