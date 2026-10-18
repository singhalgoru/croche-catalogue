import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

const env = process.env;
for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
  if (!env[name]) throw new Error(`Missing ${name}.`);
}
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: 's3', region: 'auto', retries: 0 });
const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const request = (bucket, key, options = {}) => r2.fetch(`${base}/${bucket}/${key}`, {
  ...options, signal: AbortSignal.timeout(20_000),
});
async function checked(response, label) {
  const text = await response.text();
  if (!response.ok || /<Error(?:\s|>)/.test(text)) {
    throw new Error(`${label}: HTTP ${response.status} ${text.match(/<Code>(.*?)<\/Code>/)?.[1] ?? ''}`);
  }
  return text;
}
const privateBucket = env.R2_ORIGINALS_BUCKET;
if (privateBucket === env.R2_BUCKET) throw new Error('Private and public buckets must differ.');
if (env.R2_OBJECT_CHECK_ONLY === 'true' && !privateBucket) {
  throw new Error('Object-only cross-bucket verification requires R2_ORIGINALS_BUCKET.');
}
if (env.R2_OBJECT_CHECK_ONLY !== 'true') {
const corsBucket = privateBucket || env.R2_BUCKET;
const corsResponse = await request(corsBucket, '?cors');
const corsXml = await corsResponse.text();
console.log(`${privateBucket ? 'Private' : 'Public'} GetBucketCors: HTTP ${corsResponse.status} ${corsXml.match(/<Code>(.*?)<\/Code>/)?.[1] ?? ''}`);
if (privateBucket && env.R2_CONFIGURE_PREVIEW_CORS === 'true' &&
    (corsResponse.ok || corsXml.includes('<Code>NoSuchCORSConfiguration</Code>'))) {
  const existing = corsResponse.ok ? [...corsXml.matchAll(/<CORSRule\b[^>]*>[\s\S]*?<\/CORSRule>/g)].map(match => match[0]) : [];
  const hasRequired = existing.some(rule => rule.includes('<AllowedOrigin>https://luviacreations.com</AllowedOrigin>')
    && ['GET', 'HEAD'].every(method => rule.includes(`<AllowedMethod>${method}</AllowedMethod>`))
    && /<AllowedHeader>(?:\*|Range|range)<\/AllowedHeader>/.test(rule));
  if (hasRequired) console.log('Production private-preview CORS already present; no change.');
  else {
    const rule = '<CORSRule><AllowedOrigin>https://luviacreations.com</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>Range</AllowedHeader><AllowedHeader>Content-Type</AllowedHeader><ExposeHeader>Accept-Ranges</ExposeHeader><ExposeHeader>Content-Length</ExposeHeader><ExposeHeader>Content-Range</ExposeHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>300</MaxAgeSeconds></CORSRule>';
    const xml = `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${existing.join('')}${rule}</CORSConfiguration>`;
    const response = await request(privateBucket, '?cors', { method: 'PUT', body: xml,
      headers: { 'Content-Type': 'application/xml', 'Content-MD5': createHash('md5').update(xml).digest('base64') } });
    await checked(response, 'Private PutBucketCors');
    console.log(`Private CORS merged; preserved ${existing.length} existing rule(s).`);
    const verified = await checked(await request(privateBucket, '?cors'), 'Verify private CORS');
    if (!verified.includes('https://luviacreations.com')) throw new Error('CORS verification did not contain production origin.');
    console.log('Private CORS re-read verified.');
  }
} else if (privateBucket) {
  console.log('Preview uses native no-CORS media and authenticated Edge upload; no bucket CORS change is required.');
  console.log('Optional CORS management skipped; object permission tests will still run.');
}
} else console.log('Object-only mode: no CORS or public-access configuration reads/writes.');

const prefix = `making-video-smoke/${randomUUID()}`;
console.log(`Owned smoke namespace (for exact-key recovery if interrupted): ${prefix}`);
const body = new TextEncoder().encode(`Luvia bounded permission verification ${prefix}`);
const owned = [];
let operationError;
let cleanupFailed = false;
try {
  const sourceBucket = privateBucket || env.R2_BUCKET;
  const source = `${prefix}/source.txt`;
  owned.push([sourceBucket, source]);
  await checked(await request(sourceBucket, source, { method: 'PUT', body,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }), 'Source PutObject');
  const stored = await request(sourceBucket, source);
  if (!stored.ok || Buffer.compare(Buffer.from(await stored.arrayBuffer()), body) !== 0) throw new Error('Source GetObject mismatch.');
  console.log(`${privateBucket ? 'Private' : 'Public'} exact-object PUT/GET verified.`);
  if (privateBucket) {
    for (const [from, to, sourceKey, targetKey] of [
      [privateBucket, env.R2_BUCKET, source, `${prefix}/copy-public.txt`],
      [env.R2_BUCKET, privateBucket, `${prefix}/copy-public.txt`, `${prefix}/copy-private.txt`],
    ]) {
      owned.push([to, targetKey]);
      await checked(await request(to, targetKey, { method: 'PUT',
        headers: { 'x-amz-copy-source': `/${from}/${sourceKey}`, 'x-amz-metadata-directive': 'REPLACE',
          'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }), 'Cross-bucket CopyObject');
      const copy = await request(to, targetKey);
      if (!copy.ok || Buffer.compare(Buffer.from(await copy.arrayBuffer()), body) !== 0) throw new Error('CopyObject byte verification failed.');
      console.log(`Cross-bucket ${from === privateBucket ? 'private → public' : 'public → private'} CopyObject verified.`);
    }
  } else console.log('Private bucket name missing: cross-bucket CopyObject and private CORS not attempted.');
} catch (error) {
  operationError = error;
}
for (const [bucket, key] of owned.reverse()) {
    try {
      await checked(await request(bucket, key, { method: 'DELETE' }), 'Exact smoke object cleanup');
      const head = await request(bucket, key, { method: 'HEAD' });
      if (head.status !== 404) throw new Error(`Cleanup HEAD expected 404; got ${head.status}.`);
      console.log(`Cleaned exact smoke object: ${key}`);
    } catch (error) {
      cleanupFailed = true;
      console.error(`Cleanup failed for ${bucket === privateBucket ? 'private' : 'public'} exact key ${key}: ${error.message}`);
    }
}
if (cleanupFailed) throw new Error('Some exact smoke objects could not be confirmed deleted.');
if (operationError) throw operationError;
