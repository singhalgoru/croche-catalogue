# Luvia Crochet Catalogue

A mobile-friendly catalogue for Luvia handmade crochet products.

It lets visitors browse crochet products, view product details, check available
variants and angle photos, zoom images, and start an enquiry on WhatsApp.

© 2026 Luvia. All rights reserved. This repository is public for transparency,
but its code, brand assets, catalogue content, and product photography are not
licensed for reuse — see [LICENSE](./LICENSE).

## Features

- Responsive product catalogue
- Category filtering and search
- Product detail view with image carousel
- Variant and additional-angle image previews
- Zoom and 3D-style image viewing
- WhatsApp enquiry links
- Installable app experience on supported browsers

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run test -- --run
npm run build
```

## Product images

The catalogue requests responsive thumbnails from Supabase Storage's public image
transformation endpoint for product cards and variant selectors. Opening a product
still uses the original high-resolution image for zoom. Static images outside
Supabase continue to load without transformation. Public image transformations
must remain enabled in the Supabase project.

New admin uploads (JPG, PNG or WebP) are resized to at most 1600 pixels on the
longest side and encoded as WebP at 82% quality when this reduces file size.
This does not change images already stored in Supabase; to reduce storage usage,
existing originals need a separate, reviewed migration.

## Initial page load

The public catalogue loads without downloading the admin console or product
detail modal; those modules load when their respective views open. The page
preconnects to the configured Supabase origin so the catalogue and its first
image do not wait for a new connection after JavaScript starts. Baloo 2 and
Quicksand are self-hosted variable fonts with `font-display: swap`, rather
than depending on a render-blocking Google Fonts stylesheet. Characters
outside their Latin subset use the system font.
The redistributed font licenses are in [Baloo 2](./public/fonts/OFL-Baloo-2.txt)
and [Quicksand](./public/fonts/OFL-Quicksand.txt).

## Analytics

GA4 and the Meta Pixel are loaded for the public catalogue only; the `#admin`
console is never tracked.

To keep your own browsing out of the reports, open the catalogue once with
`?traffic=internal` appended to the URL:

https://singhalgoru.github.io/croche-catalogue/?traffic=internal

That browser then tags every GA4 hit with `traffic_type=internal` and stops
sending Meta Pixel events. Enable the built-in **Internal Traffic** data filter
in GA4 (Admin → Data Settings → Data Filters) so the tagged hits are excluded
from reports. Visit `?traffic=external` to undo the marker.

The marker lives in that browser's local storage, so repeat it per browser,
per device, and after clearing site data. Incognito windows always start
untagged and count as new users.

## Deployment

The public catalogue is deployed with GitHub Pages:

https://singhalgoru.github.io/croche-catalogue/
