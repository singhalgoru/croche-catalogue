# Luvia Crochet Catalogue

A mobile-friendly catalogue for Luvia handmade crochet products.

It lets visitors browse crochet products, view product details, check available
variants and angle photos, zoom images, and get in touch by WhatsApp or email.

© 2026 Luvia. All rights reserved. This repository is public for transparency,
but its code, brand assets, catalogue content, and product photography are not
licensed for reuse — see [LICENSE](./LICENSE).

## Features

- Responsive product catalogue
- Category filtering and search
- Admin-controlled product order shared across the main catalogue and categories
- Product detail view with image carousel
- Variant and additional-angle image previews
- Zoom and 3D-style image viewing
- WhatsApp enquiry links
- Email contacts for orders and general enquiries
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

Product photos are stored on Cloudflare R2 and served from
`images.luviacreations.com`. Admin uploads (JPG, PNG or WebP) are resized to at
most 1600 pixels on the longest side, encoded as WebP, and uploaded with 160,
480 and 960 pixel copies (`<id>-w160.webp` and so on) through the `r2-images`
Edge Function; the catalogue picks the smallest copy that fits. If R2 is not
configured, uploads fall back to Supabase Storage, whose images are resized
through its public transformation endpoint.

If the image host changes, update `isR2ImageHost`, the CSP in `index.html`,
`scripts/prerender.mjs` and `public/catalogue-prefetch.js`. R2 photos are
intentionally left out of the service worker cache: they are served with an
immutable one-year `Cache-Control`, and routing `<img>` loads through the worker
made them depend on R2's conditional CORS headers.

The database and images are backed up daily, and the backup is test-restored
monthly. Setup and restore steps are kept in the private operations notes.

## AI product image generation

The admin console can generate studio and lifestyle product photos from uploaded
reference images using the `enhance-product-image` Supabase Edge Function. It
supports Google Gemini, OpenAI and Cloudflare Workers AI, falls back between
them on quota limits or errors, and keeps API keys in Edge Function secrets.

## AI variant names

When adding or editing a variant, **✨ Suggest name with AI** sends the variant photo,
the product name, and the existing variant names to the `analyze-product` Edge Function
(`mode: "variant-name"`). Gemini vision (free tier) returns a short name that follows the
existing naming pattern plus a matching hex colour; both stay editable before saving.
When a variant shares a colour with an existing one, the name adds the distinguishing
pattern or texture (e.g. "Lavender Stripes"), and the function automatically re-asks
Gemini (up to 3 attempts) if it suggests a name that is already taken.

## Initial page load

The public catalogue loads without downloading the admin console or product
detail modal; those modules load when their respective views open. The page
preconnects to the configured Supabase origin so the catalogue and its first
image do not wait for a new connection after JavaScript starts. A small,
early script starts the public, published-only product and category requests
while the main bundle downloads; the app reuses their responses instead of
fetching twice. As soon as the product rows arrive, that script also preloads
the first card's photo from `images.luviacreations.com` (preconnected in
`index.html`), so the largest image starts before React renders. Its ordering
and `srcset`/`sizes` must stay in step with `compareCatalogueProducts` and
`ProductCard`, or the photo downloads twice.
Baloo 2 and
Quicksand are self-hosted variable fonts with `font-display: swap`, rather
than depending on a render-blocking Google Fonts stylesheet. Characters
outside their Latin subset use the system font.
The redistributed font licenses are in [Baloo 2](./public/fonts/OFL-Baloo-2.txt)
and [Quicksand](./public/fonts/OFL-Quicksand.txt).
GA4 and Meta Pixel queue their page-view events immediately but fetch their
external scripts after the page load event, so they do not compete with the
initial product image download.

## Analytics

GA4 and the Meta Pixel are loaded for the public catalogue only; the `#admin`
console is never tracked.

Internal visits can be excluded from the reports by opening the site once with
`?traffic=internal` in each browser.

## Deployment

The public catalogue is deployed with GitHub Pages at:

https://luviacreations.com/

The previous GitHub Pages URL redirects to the custom domain:

https://singhalgoru.github.io/croche-catalogue/

The build fetches published products from Supabase and generates a crawlable
`/p/<product>/` page and sitemap entry for each one. The deploy workflow runs on
every push to `main`, about a minute after any catalogue change in admin (via a
database trigger), and daily at 01:23 UTC as a safety net.
Check the deploy workflow if an update
has not appeared. GitHub Pages and browsers may cache the sitemap briefly.
Shared product links use these pages so link previews show the product photo
(an 800px `og.jpg` written beside each page). A small hash-pinned script sends
human visitors on to the app's product view, while crawlers stay on the static page.

For AI discovery, the site also publishes [public/llms.txt](./public/llms.txt).
