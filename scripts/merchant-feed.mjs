import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { escapeHtml, fetchProducts, renderProductPage, toProductReference, toProductSlug, toVariantSlug } from './prerender.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://luviacreations.com';

// Reviewed catalogue photos contain added text, even in the pre-watermark backup.
const TEXT_OVERLAY_IMAGES = new Set([
  'static/whatsapp-image-2026-09-08-at-17-18-03/original.webp',
  'static/whatsapp-image-2026-09-15-at-16-33-02/original.webp',
  'static/whatsapp-image-2026-09-16-at-14-53-14/original.webp',
  'static/whatsapp-image-2026-09-01-at-12-10-10/original.webp',
  'static/collages-evil-eye-charm-collage/original.webp',
  'static/collages-pawprint-charm-collage/original.webp',
  '7e80016f-7623-4f3f-831d-23265eada79e/50ce6a4e-e32c-44d6-a783-d70bafcabcaf/original.webp',
  '7e80016f-7623-4f3f-831d-23265eada79e/fb95973d-c3fa-4451-89e1-5e15a337cb67/original.webp',
  '7e80016f-7623-4f3f-831d-23265eada79e/421817a3-1fce-43ef-9b07-271fee928926/original.webp',
]);

export const cleanImageKey = (source) => {
  const url = new URL(source);
  if (url.origin !== 'https://images.luviacreations.com' ||
      !/^\/products\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.webp$/.test(url.pathname)) {
    throw new Error(`Unsupported Merchant image URL: ${source}`);
  }
  return url.pathname.slice('/products/'.length).replace(/(?:-wm\d*)?\.webp$/, '/original.webp');
};

export const merchantItems = (products) => {
  const items = [];
  for (const product of products) {
    if (product.price === null) {
      console.warn(`[merchant] Excluding price-on-request product: ${product.name}`);
      continue;
    }
    const variants = product.variants.length ? product.variants : [null];
    for (const variant of variants) {
      const price = variant?.price ?? product.price;
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Merchant price: ${product.name}`);
      if (!product.description.trim()) throw new Error(`Missing Merchant description: ${product.name}`);
      const id = variant?.id ?? product.id;
      if (!id || (variant && !variant.name.trim())) throw new Error(`Missing Merchant variant identity: ${product.name}`);
      const candidates = [variant?.image || product.image, ...(variant?.images ?? [])];
      const cleanKeys = [...new Set(candidates.map(cleanImageKey))]
        .filter((key) => !TEXT_OVERLAY_IMAGES.has(key));
      const image = candidates.find((source) => cleanImageKey(source) === cleanKeys[0]);
      if (!image) {
        console.warn(`[merchant] Excluding ${product.name}: its available photos contain added text; upload a plain product photo.`);
        continue;
      }
      items.push({
        ...product,
        merchantId: id,
        groupId: product.variants.length > 1 ? product.id : null,
        variantName: product.variants.length > 1 ? variant.name : null,
        name: product.variants.length > 1 ? `${product.name.trim()} - ${variant.name}` : product.name.trim(),
        catalogueReference: toProductSlug(product),
        price,
        inStock: variant?.inStock ?? product.inStock,
        image,
        cleanKey: cleanImageKey(image),
        additionalCleanKeys: cleanKeys.slice(1, 11),
        variants: [],
        url: `${ORIGIN}/shopping/${toProductSlug(product)}/${toVariantSlug(variant)}/`,
        legacyUrl: `${ORIGIN}/shopping/${toProductReference(product)}/${id}/`,
      });
    }
  }
  return items;
};

export const renderMerchantFeed = (items) => {
  const field = (name, value) => `<g:${name}>${escapeHtml(value)}</g:${name}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>Luvia Creations</title><link>${ORIGIN}/</link><description>Handmade crochet products, priced in INR.</description>
${items.map((item) => `<item>${[
    field('id', item.merchantId),
    field('title', item.name.slice(0, 150)),
    field('description', item.description.slice(0, 5000)),
    field('link', item.url),
    field('image_link', item.image),
    ...(item.additionalImages ?? []).map((image) => field('additional_image_link', image)),
    field('availability', item.inStock ? 'in_stock' : 'out_of_stock'),
    field('price', `${item.price.toFixed(2)} INR`),
    field('condition', 'new'),
    field('brand', 'Luvia Creations'),
    field('identifier_exists', 'no'),
    field('product_type', item.category),
    ...(item.groupId ? [field('item_group_id', item.groupId), field('color', item.variantName)] : []),
  ].join('')}</item>`).join('\n')}
</channel></rss>
`;
};

export const writeMerchantCatalogue = async (items, dist, getImage, whatsappNumber) => {
  const images = new Map();
  await mkdir(path.join(dist, 'merchant-images'), { recursive: true });
  const published = [];
  const publishImage = async (key, name) => {
    let image = images.get(key);
    if (!image) {
      const input = await getImage(key);
      const metadata = await sharp(input).metadata();
      if (metadata.format !== 'webp') throw new Error(`Merchant original is not processed WebP: ${key}`);
      if (Math.min(metadata.width, metadata.height) < 500) throw new Error(`Merchant image must be at least 500x500 pixels: ${name} (${key})`);
      const data = await sharp(input).rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .keepXmp().webp({ quality: 82 }).toBuffer();
      if (data.length > 16 * 1024 * 1024) throw new Error(`Merchant image exceeds 16 MB: ${name}`);
      const filename = `${createHash('sha256').update(data).digest('hex')}.webp`;
      await writeFile(path.join(dist, 'merchant-images', filename), data);
      image = `${ORIGIN}/merchant-images/${filename}`;
      images.set(key, image);
    }
    return image;
  };
  for (const item of items) {
    const image = await publishImage(item.cleanKey, item.name);
    const additionalImages = [];
    for (const key of item.additionalCleanKeys ?? []) {
      const additionalImage = await publishImage(key, item.name);
      if (additionalImage !== image && !additionalImages.includes(additionalImage)) {
        additionalImages.push(additionalImage);
      }
    }
    const publishedItem = { ...item, image, additionalImages };
    const dir = path.join(dist, ...new URL(item.url).pathname.split('/').filter(Boolean));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderProductPage(publishedItem, whatsappNumber, null, false));
    if (item.legacyUrl !== item.url) {
      const legacyDir = path.join(dist, ...new URL(item.legacyUrl).pathname.split('/').filter(Boolean));
      await mkdir(legacyDir, { recursive: true });
      await writeFile(path.join(legacyDir, 'index.html'), renderProductPage(publishedItem, whatsappNumber, null, false));
    }
    published.push(publishedItem);
  }
  await writeFile(path.join(dist, 'merchant-feed.xml'), renderMerchantFeed(published));
  console.log(`[merchant] Published ${published.length} items and ${images.size} clean images.`);
};

const main = async () => {
  const env = { ...loadEnv('production', ROOT, 'VITE_'), ...process.env };
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ORIGINALS_BUCKET'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing Merchant configuration: ${missing.join(', ')}`);
  const items = merchantItems(await fetchProducts(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY));
  if (!items.length) throw new Error('Refusing to publish an empty Merchant feed');
  const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  await writeMerchantCatalogue(items, path.join(ROOT, 'dist'), async (key) => {
    const response = await r2.fetch(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_ORIGINALS_BUCKET}/${key}`);
    if (!response.ok) throw new Error(`Clean Merchant image download failed (${response.status}): ${key}`);
    return Buffer.from(await response.arrayBuffer());
  }, env.VITE_WHATSAPP_NUMBER?.trim() || '919205907350');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[merchant] Failed: ${error.message}`); process.exitCode = 1; });
}
