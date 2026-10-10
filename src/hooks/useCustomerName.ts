import { useEffect, useState } from 'react';
import { loadSupabase } from '../lib/supabaseConfig';
import { fetchCustomerAccount, fetchCustomerProfile } from '../services/customer';

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
    let unsubscribe: (() => void) | undefined;
    const refresh = async () => {
      try {
        const email = await fetchCustomerAccount();
        if (!email) { if (current) setName(null); return; }
        const profile = await fetchCustomerProfile().catch(() => null);
        if (current) setName(customerDisplayName(profile?.name, email));
      } catch {
        if (current) setName(null);
      }
    };
    void refresh();
    void loadSupabase().then(client => {
      if (!current || !client) return;
      const { data } = client.auth.onAuthStateChange(() => { window.setTimeout(() => { if (current) void refresh(); }, 0); });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => undefined);
    return () => { current = false; unsubscribe?.(); };
  }, []);
  return name;
}
