import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transpileModule, ScriptTarget } from 'typescript';
import { beforeEach, expect, it } from 'vitest';

const source = readFileSync(resolve('supabase', 'functions', 'r2-images', 'index.ts'), 'utf8')
  .replace(/^import .+;\r?\n/gm, '');
const compiled = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
let handler: (request: Request) => Promise<Response>;
let deleted: string[];
let references: { name: string }[];
let referenceError: { message: string } | null;
let failedDelete: boolean;
let allowed: boolean;

beforeEach(() => {
  deleted = [];
  references = [];
  referenceError = null;
  failedDelete = false;
  allowed = true;
  const env: Record<string, string> = {
    R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-key', R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'public-images', R2_PUBLIC_URL: 'https://images.luviacreations.com',
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon',
  };
  runInNewContext(compiled, {
    Response, Request, Uint8Array, FormData, File,
    Deno: { env: { get: (name: string) => env[name] }, serve: (callback: typeof handler) => { handler = callback; } },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }) },
      rpc: async () => ({ data: allowed, error: null }),
      from: (table: string) => {
        expect(table).toBe('categories');
        return { select: () => ({ in: async (field: string, urls: string[]) => {
          expect(field).toBe('cover_image_url');
          expect(urls).toEqual(['https://images.luviacreations.com/products/admin/old.webp']);
          return { data: references, error: referenceError };
        } }) };
      },
    }),
    AwsClient: class {
      async fetch(url: string, options: { method: string }) {
        expect(options.method).toBe('DELETE');
        deleted.push(new URL(url).pathname);
        return new Response(null, { status: failedDelete ? 503 : 204 });
      }
    },
  });
});

const remove = () => handler(new Request('https://supabase.test/functions/v1/r2-images', {
  method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'delete', paths: ['r2:products/admin/old'] }),
}));

it('deletes the full old cover and exactly every generated public rendition', async () => {
  expect((await remove()).status).toBe(200);
  expect(deleted.sort()).toEqual([
    '/public-images/products/admin/old.webp',
    '/public-images/products/admin/old-w160.webp',
    '/public-images/products/admin/old-w480.webp',
    '/public-images/products/admin/old-w960.webp',
  ].sort());
});

it('refuses deletion while a cover is still referenced', async () => {
  references = [{ name: 'Festive' }];
  expect((await remove()).status).toBe(409);
  expect(deleted).toEqual([]);
});

it('fails closed when references cannot be checked or MFA access is denied', async () => {
  referenceError = { message: 'Database unavailable' };
  expect((await remove()).status).toBe(500);
  allowed = false;
  expect((await remove()).status).toBe(403);
  expect(deleted).toEqual([]);
});

it('surfaces storage failures and retries every rendition', async () => {
  failedDelete = true;
  expect((await remove()).status).toBe(502);
  expect(deleted).toHaveLength(4);
  failedDelete = false;
  expect((await remove()).status).toBe(200);
  expect(deleted).toHaveLength(8);
});
