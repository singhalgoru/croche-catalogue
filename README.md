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

The catalogue requests responsive thumbnails from Supabase Storage's public image
transformation endpoint for product cards and variant selectors. Opening a product
still uses the original high-resolution image for zoom. Static images outside
Supabase continue to load without transformation. Public image transformations
must remain enabled in the Supabase project.

New admin uploads (JPG, PNG or WebP) are resized to at most 1600 pixels on the
longest side and encoded as WebP at 82% quality when this reduces file size.
This does not change images already stored in Supabase; to reduce storage usage,
existing originals need a separate, reviewed migration.

### Cloudflare R2 image storage

Product images can be served from Cloudflare R2, which has no egress fees, to
stay within Supabase's cached egress quota. R2 does not resize images on the fly,
so the admin uploads the full WebP plus 160, 480 and 960 pixel copies
(`<id>-w160.webp` and so on) through the `r2-images` Edge Function. The catalogue
picks the smallest copy that fits. Until the function's R2 secrets are set it
returns 501, and uploads automatically fall back to Supabase Storage.

1. In the Cloudflare dashboard, enable R2 and create a bucket, such as
   `luvia-product-images`.
2. Give the bucket a public URL. The preferred option is the custom domain
   `images.luviacreations.com`, which requires the domain's DNS zone to be on
   Cloudflare. The `https://pub-….r2.dev` URL is rate-limited, so use it for
   testing only.
3. Add a bucket CORS rule that allows `GET` and `HEAD` from
   `https://luviacreations.com`, `https://singhalgoru.github.io` and
   `http://localhost:5173`.
4. Create an R2 API token with **Object Read & Write** access to the bucket.
5. Set the Edge Function secrets and deploy:

   ```sh
   npx supabase secrets set R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
     R2_BUCKET=luvia-product-images R2_PUBLIC_URL=https://images.luviacreations.com \
     R2_ACCOUNT_ID=<cloudflare-account-id>
   npx supabase functions deploy r2-images
   ```

   `R2_ACCOUNT_ID` falls back to `CLOUDFLARE_ACCOUNT_ID` when omitted.
6. Copy existing images and repoint the database rows. This covers Supabase
   Storage images and the original photos in `public/images`, which are resized
   locally with `sharp`. The script does a dry run unless you pass `--apply`. It
   skips objects already in R2, so it can be rerun, and it keeps the originals.
   Put the R2 values in a gitignored `.env.r2.local` file:

   ```sh
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     node --env-file=.env.r2.local scripts/migrate-images-to-r2.mjs --apply
   ```

If you use a public URL other than `images.luviacreations.com` or `*.r2.dev`,
add its host to `isR2ImageHost`, the CSP in `index.html`,
`scripts/prerender.mjs` and `public/catalogue-prefetch.js`. R2 photos are
intentionally left out of the service worker cache: they are served with an
immutable one-year `Cache-Control`, and routing `<img>` loads through the worker
made them depend on R2's conditional CORS headers.

### Backing up images

R2 has no automatic backup of its own. The daily `backup-database.yml` workflow
copies new images into `r2-images/` in the private
`croche-catalogue-backups` repo, next to the database backup. It uses the
`R2_*` repository secrets. To make an extra local copy, run:

```sh
npm run backup:images                       # into r2-image-backup/ (gitignored)
npm run backup:images -- "D:/OneDrive/Luvia images"   # or any folder
```

It reads the credentials from `.env.r2.local`, so keep that file. Repeat runs
only download new images and never delete local copies. Using a OneDrive or
Google Drive folder also keeps the copy off this computer. To restore,
re-upload the files under the same keys, for example with `rclone` or the R2
dashboard.

`verify-backup-restore.yml` is a restore drill that runs monthly, or on demand
from the Actions tab. It decrypts the latest database backup, restores it into
a throwaway Supabase Postgres container, compares row counts and logins with
production (read-only), and checks that every image the catalogue uses is in
the image backup. If it fails, the backups need attention before they are needed.

## AI product image generation

The admin console can generate studio and lifestyle product photos from uploaded
reference images using the `enhance-product-image` Supabase Edge Function:
- **Pluggable AI architecture:** Supports **Google Gemini** (`GEMINI_API_KEY`), **OpenAI** (`OPENAI_API_KEY`), and **Cloudflare Workers AI** (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`).
- **Auto-routing with fallback:** In "Auto" mode, the function prioritizes OpenAI and Google Gemini when keys are configured for superior prompt adherence and stitch preservation, seamlessly falling back to Cloudflare Workers AI if quotas are hit or errors occur.
- **Cloudflare resilience:** When running on Cloudflare, the function uses `@cf/black-forest-labs/flux-2-klein-9b` as primary and automatically falls back to `@cf/runwayml/stable-diffusion-v1-5-img2img` if GPU queues or quotas are busy.
- Secrets are stored securely in Supabase Edge Function secrets and never exposed to the client.

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

To keep your own browsing out of the reports, open the catalogue once with
`?traffic=internal` appended to the URL:

https://luviacreations.com/?traffic=internal

That browser then tags every GA4 hit with `traffic_type=internal` and stops
sending Meta Pixel events. Enable the built-in **Internal Traffic** data filter
in GA4 (Admin → Data Settings → Data Filters) so the tagged hits are excluded
from reports. Visit `?traffic=external` to undo the marker.

The marker lives in that browser's local storage, so repeat it per browser,
per device, and after clearing site data. Incognito windows always start
untagged and count as new users.

## Deployment

The public catalogue is deployed with GitHub Pages at:

https://luviacreations.com/

The previous GitHub Pages URL redirects to the custom domain:

https://singhalgoru.github.io/croche-catalogue/

For Google Search Console, verify the domain property `luviacreations.com`
using the TXT record Google provides, then submit
`https://luviacreations.com/sitemap.xml`. The build fetches published products
from Supabase and generates a crawlable `/p/<product>/` page and sitemap entry
for each one. The deploy workflow rebuilds on every push to `main`, about a
minute after any catalogue change in admin, and daily at 01:23 UTC (06:53 IST)
as a safety net, so products added, edited, unpublished, or deleted in
admin appear in the generated pages and sitemap after the next successful
deployment (GitHub may delay scheduled runs). Change-triggered rebuilds need a
GitHub token in Supabase Vault:

1. Create a fine-grained token at GitHub → Settings → Developer settings →
   Fine-grained tokens, limited to this repository, with only
   **Actions: Read and write** permission.
2. In the Supabase SQL Editor run
   `select vault.create_secret('<token>', 'github_deploy_token');`
   (to replace it later: `select vault.update_secret(id, '<token>') from vault.secrets where name = 'github_deploy_token';`).

Without the token, saves still work and the daily run picks up changes.
Check the deploy workflow if an update
has not appeared. GitHub Pages and browsers may cache the sitemap briefly.
Shared product links use these pages so link previews show the product photo
(an 800px `og.jpg` written beside each page). A small hash-pinned script sends
human visitors on to the app's product view, while crawlers stay on the static page.
