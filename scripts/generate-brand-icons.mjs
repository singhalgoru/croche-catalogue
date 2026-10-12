import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const logo = await readFile(new URL('public/images/luvia-logo.jpg', root));
const source = await sharp(logo)
  .extract({ left: 8, top: 8, width: 752, height: 752 })
  .modulate({ saturation: 1.15 })
  .png()
  .toBuffer();
const outputs = [
  ['images/favicon-48.png', 48],
  ['images/favicon-96.png', 96],
  ['images/favicon-192.png', 192],
  ['images/apple-touch-icon.png', 180],
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
];

for (const [file, size] of outputs) {
  await sharp(source).resize(size, size).sharpen({ sigma: 0.5 }).png().toFile(fileURLToPath(new URL(`public/${file}`, root)));
}

// PNG-backed ICO entries preserve clarity in both small tabs and larger search results.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).sharpen({ sigma: 0.5 }).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(new URL('public/favicon.ico', root), Buffer.concat([header, ...images]));
console.log('Generated favicons and app icons from the original Luvia brand design.');
