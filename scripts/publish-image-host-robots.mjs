import { readFile } from 'node:fs/promises';
import { AwsClient } from 'aws4fetch';

const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('R2 account, access key, secret key and bucket configuration are required.');
}

const body = await readFile(new URL('./image-host-robots.txt', import.meta.url), 'utf8');
const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
});
const response = await client.fetch(
  `https://${accountId}.r2.cloudflarestorage.com/${bucket}/robots.txt`,
  {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  },
);
if (!response.ok) {
  throw new Error(`Unable to publish image-host robots.txt: ${response.status} ${await response.text()}`);
}
console.log('Published image-host robots.txt: only the exact root is excluded.');
