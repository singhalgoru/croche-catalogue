import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, loadSupabase } from '../lib/supabaseConfig';

export function useBestsellerIds(initialIds: string[] = [], enabled = true) {
  const [ids, setIds] = useState<string[]>(() => [...new Set(initialIds)].slice(0, 6));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(enabled && isSupabaseConfigured);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAttempt(value => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [enabled, retry]);
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let current = true;
    void (async () => {
      const client = await loadSupabase();
      if (!client) throw new Error('Supabase is not configured.');
      const { data, error } = await client.rpc('get_catalogue_bestsellers');
      if (error) throw new Error(error.message);
      if (!Array.isArray(data) || data.some(row =>
        !row || typeof row !== 'object' || typeof row.product_id !== 'string')) {
        throw new Error('Invalid bestsellers response.');
      }
      if (current) setIds([...new Set(data.map(row => String(row.product_id)))].slice(0, 6));
    })().catch(error => {
      console.error('Unable to load bestsellers:', error);
      if (current) setError('Unable to load the latest bestsellers. Please try again.');
    }).finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [enabled, attempt]);
  return { ids, error, isLoading, retry };
}
