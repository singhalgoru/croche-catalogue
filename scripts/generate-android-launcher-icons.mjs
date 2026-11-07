import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const logo = await readFile(new URL('public/images/luvia-logo.jpg', root));
const mask = Buffer.from('<svg width="752" height="752"><circle cx="376" cy="376" r="368" fill="white"/></svg>');
const circularLogo = await sharp(logo)
  .extract({ left: 8, top: 8, width: 752, height: 752 })
  .modulate({ saturation: 1.15 })
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const sizes = [
  ['mdpi', 48, 108, 300],
  ['hdpi', 72, 162, 450],
  ['xhdpi', 96, 216, 600],
  ['xxhdpi', 144, 324, 900],
  ['xxxhdpi', 192, 432, 1200],
];

for (const [density, legacySize, foregroundSize, splashSize] of sizes) {
  const directory = new URL(`android/app/src/main/res/mipmap-${density}/`, root);
  await mkdir(directory, { recursive: true });
  const foregroundLogoSize = Math.round(foregroundSize * 66 / 108);
  const foreground = await sharp(circularLogo).resize(foregroundLogoSize, foregroundLogoSize).png().toBuffer();
  await sharp({ create: { width: foregroundSize, height: foregroundSize, channels: 4, background: '#00000000' } })
    .composite([{ input: foreground, gravity: 'centre' }])
    .png().toFile(fileURLToPath(new URL('ic_launcher_foreground.png', directory)));

  const legacyLogoSize = Math.round(legacySize * 0.96);
  const legacyLogo = await sharp(circularLogo).resize(legacyLogoSize, legacyLogoSize).png().toBuffer();
  await sharp({ create: { width: legacySize, height: legacySize, channels: 4, background: '#fdf6ec' } })
    .composite([{ input: legacyLogo, gravity: 'centre' }])
    .png().toFile(fileURLToPath(new URL('ic_launcher.png', directory)));

  const splashDirectory = new URL(`android/app/src/main/res/drawable-${density}/`, root);
  await mkdir(splashDirectory, { recursive: true });
  await sharp(circularLogo).resize(splashSize, splashSize).png()
    .toFile(fileURLToPath(new URL('splash.png', splashDirectory)));
}
