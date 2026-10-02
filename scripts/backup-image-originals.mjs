import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const backupOriginals = async (client, destination) => {
  const bucket = client.storage.from('product-originals');
  const root = path.resolve(destination);
  let downloaded = 0;
  let total = 0;
  const visit = async (prefix = '') => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`Unable to list private originals: ${error.message}`);
      if (!data) throw new Error('Private originals listing returned no data.');
      for (const item of data) {
        if (!item.name || item.name === '.' || item.name === '..' || /[/\\]/.test(item.name)) {
          throw new Error('Unsafe path in private original backup.');
        }
        const key = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id) {
          await visit(key);
          continue;
        }
        total++;
        const file = path.join(root, ...key.split('/'));
        const local = await stat(file).catch((error) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (local && local.size === Number(item.metadata?.size)) continue;
        const { data: blob, error: downloadError } = await bucket.download(key);
        if (downloadError || !blob) {
          throw new Error(`Unable to back up original ${key}: ${downloadError?.message ?? 'No image data'}`);
        }
        const body = Buffer.from(await blob.arrayBuffer());
        if (item.metadata?.size != null && body.length !== Number(item.metadata.size)) {
          throw new Error(`Original ${key} has an unexpected size.`);
        }
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
        downloaded++;
      }
      if (data.length < 100) break;
    }
  };
  await visit();
  console.log(`Private originals: ${total} files, ${downloaded} downloaded to ${root}.`);
  return { total, downloaded };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !process.argv[2]) {
    throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and provide a backup destination.');
  }
  await backupOriginals(
    createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    process.argv[2],
  );
}
