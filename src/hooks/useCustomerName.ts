import { useEffect, useState } from 'react';
import { loadSupabase } from '../lib/supabaseConfig';
import { fetchCustomerIdentity, fetchCustomerProfile } from '../services/customer';

export function customerDisplayName(profileName: string | undefined, email: string) {
  const first = profileName?.trim().split(/\s+/)[0];
  if (first) return first.slice(0, 24);
  return email.split('@')[0].slice(0, 24);
}

/** Returns the signed-in (verified, non-guest) customer's display name, or null. */
export function useCustomerName() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    let version = 0;
    let unsubscribe: (() => void) | undefined;
    const refresh = async () => {
      const request = ++version;
      try {
        const identity = await fetchCustomerIdentity();
        if (!identity) { if (current && request === version) setName(null); return; }
        const profile = identity.name ? null : await fetchCustomerProfile().catch(error => {
          console.error('Unable to load greeting profile:', error);
          return null;
        });
        if (current && request === version) setName(customerDisplayName(identity.name || profile?.name, identity.email));
      } catch (error) {
        console.error('Unable to load account greeting:', error);
        if (current && request === version) setName(null);
      }
    };
    const onRefresh = () => { void refresh(); };
    window.addEventListener('admin-account-updated', onRefresh);
    window.addEventListener('focus', onRefresh);
    void refresh();
    void loadSupabase().then(client => {
      if (!current || !client) return;
      const { data } = client.auth.onAuthStateChange(() => { window.setTimeout(() => { if (current) void refresh(); }, 0); });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(error => console.error('Unable to subscribe to account changes:', error));
    return () => {
      current = false; unsubscribe?.();
      window.removeEventListener('admin-account-updated', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, []);
  return name;
}
