import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptMetaToken } from './metaCredentials.ts';
import { readMetaConfig } from '../marketing-read/meta.ts';

export async function loadMetaAccess(env: (name: string) => string | undefined) {
  const encryptionKey = env('META_TOKEN_ENCRYPTION_KEY');
  let accessToken: string | undefined;
  let expiresAt: string | null = null;
  if (env('META_OAUTH_STATE_SECRET') && !encryptionKey) {
    throw new Error('Meta credential encryption key is missing.');
  }
  if (encryptionKey) {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Meta credential storage is not configured.');
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from('meta_marketing_credential')
      .select('ciphertext, expires_at').eq('id', true).maybeSingle();
    if (error) throw new Error('Unable to read the stored Meta credential.');
    if (data) {
      try {
        accessToken = await decryptMetaToken(data.ciphertext, encryptionKey);
      } catch {
        throw new Error('Unable to decrypt the stored Meta credential.');
      }
      expiresAt = data.expires_at;
      if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) throw new Error('Stored Meta credential expiry is invalid.');
      if (Date.parse(expiresAt) <= Date.now()) throw new Error('Meta access has expired. Reconnect Meta.');
    }
  }
  return {
    config: readMetaConfig(name => name === 'META_ACCESS_TOKEN' && accessToken ? accessToken : env(name)),
    expiresAt,
  };
}
