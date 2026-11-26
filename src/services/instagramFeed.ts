import { loadSupabase } from '../lib/supabaseConfig';
import { parseInstagramFeedResponse, type InstagramFeed } from '../../supabase/functions/_shared/instagramFeed';

export async function fetchInstagramFeed(): Promise<InstagramFeed> {
  const client = await loadSupabase();
  if (!client) throw new Error('Instagram posts require an online connection.');
  const { data, error } = await client.functions.invoke('instagram-feed', { body: {} });
  if (error) throw new Error(`Unable to load Instagram posts: ${error.message}`);
  return parseInstagramFeedResponse(data);
}
