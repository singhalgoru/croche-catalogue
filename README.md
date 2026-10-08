# Luvia Crochet Catalogue

A mobile-friendly catalogue for Luvia handmade crochet products.

It lets visitors browse crochet products, view product details, check available
variants and angle photos, zoom images, and get in touch by WhatsApp or email.

© 2026 Luvia. All rights reserved. This repository is public for transparency,
but its code, brand assets, catalogue content, and product photography are not
licensed for reuse — see [LICENSE](./LICENSE).

## Features

- Responsive product catalogue
- Compact mobile header and horizontally scrolling categories, with explicit WhatsApp ordering guidance
- Top-left mobile branding and a single sticky product ordering area; Share sits beside stock status above the ordering buttons, and the product close control stays visible
- A logo-only mobile brand row with a 64px logo and short header tagline keep browsing uncluttered; desktop retains the full introduction
- Category filtering and search
- Below-catalogue ordering guide explains cart-to-WhatsApp confirmation and delivery enquiries, also present in the crawler-readable HTML; the return-policy link appears once in the footer
- Admin-controlled product order shared across the main catalogue and categories
- Product detail view with image carousel
- Hybrid product browsing: catalogue quick-view popups link to full product pages with the same gallery, variants, specifications and persistent cart
- Optional materials, dimensions, package contents and care instructions, edited in Add/Manage products and shown in collapsible customer sections only when filled
- Gemini photo-and-notes suggestions use confirmed specifications, require selective review before applying, and never publish automatically or generate price, stock or dispatch promises
- Variant and additional-angle image previews
- Selected card variants stay fixed; automatic card previews are disabled for reduced-motion preferences
- Zoom and 3D-style image viewing
- Close image zoom by clicking/tapping outside the visible photo; image gestures and viewer controls remain active
- WhatsApp enquiry links
- Dedicated order and WhatsApp contact: +91 9205907350
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

For Reddit image posts, open a product's Share menu and choose Reddit. The
photo-post helper prepares the selected photo (converting WebP to JPEG for
compatibility), offers native file sharing or
a download, and lets you copy the title and product link separately. Reddit
may discard Web Share titles/captions, so paste the copied title into its title
field and attach the downloaded photo if needed. The separate link-post option
prefills a title but cannot guarantee a Reddit image preview. No post is
published automatically.

The admin Add product form includes Price discovery in Step 2, before the
optional product specifications. Enter time and costs, suggest a GST-inclusive
price, and use it in the product editor. The estimated GST rate defaults to 5%
and remains editable; the recommended minimum quantity can also be overridden.
Pricing inputs survive draft restoration and are saved privately when the
product is published. The profit margin is recalculated from the final Price
field, including any override made after applying the suggestion.
The price discovery customer-price override accepts positive whole rupees,
matching the product price field.

The admin workspace separates Products, Orders (customer carts), Sales and
Settings (categories and store announcements). Switching sections preserves
mounted forms. Add product and Edit open focused, scrollable dialogs with a
pinned header and Close control; Escape closes them unless an operation is
running. Closing Add product retains the draft.

New products and previously unpublished products require a name (at least
2 characters), category, description (at least 10 characters), materials,
what's included, and named variants with photos. A displayed price must be a
positive whole-rupee amount; price-on-request remains supported. Dimensions,
care instructions and SEO summaries remain optional. Publication validation
also runs in the product service, not just the browser form. Already published
legacy products can still be edited without filling newly required facts.
Required product and variant fields are marked with a red asterisk; the price
marker appears only when Show price is enabled.
The Record/Edit sale form also marks required sale details, GST and cost/fee
inputs with red asterisks. Costs and fees that do not apply should be entered
as 0; the catalogue product selector and sale notes remain optional.
GST overrides on a sale (including 0%) are sale-specific snapshots: recording
or editing a sale does not change the product's saved GST rate. Selecting that
product for another sale still prefills its catalogue GST rate.

Product photos are stored on Cloudflare R2 and served from
`images.luviacreations.com`. Admin uploads (JPG, PNG or WebP) are resized to at
most 1600 pixels on the longest side, encoded as WebP, and uploaded with 160,
480 and 960 pixel copies (`<id>-w160.webp` and so on) through the `r2-images`
Edge Function; the catalogue picks the smallest copy that fits. If R2 is
unavailable, uploads fail explicitly rather than falling back to Supabase
Storage. The legacy `product-images` Supabase bucket is private and closed
to uploads; its files are preserved in the private backup repository under
`supabase-images/product-images/`. Old public Supabase image links are retired.

The image-host root is not a homepage and intentionally returns 404. Its
separate robots policy excludes only the exact root (`Disallow: /$`), keeping
product and Merchant Center image URLs crawlable. Publish that policy to R2
with `node --env-file=.env.r2.local scripts/publish-image-host-robots.mjs`.
Changing the catalogue's `public/robots.txt` does not affect the image subdomain.

If the image host changes, update `isR2ImageHost`, the CSP in `index.html`,
`scripts/prerender.mjs` and `public/catalogue-prefetch.js`. R2 photos are
intentionally left out of the service worker cache: they are served with an
immutable one-year `Cache-Control`, and routing `<img>` loads through the worker
made them depend on R2's conditional CORS headers.
Admin Gemini analysis reloads existing photos with a CORS request, rather than
reusing a browser-cached `<img>` response that may lack CORS headers. Photo-load
errors are identified separately from Gemini analysis errors.

The homepage and interactive product pages embed a build-time public catalogue
snapshot (including category priorities and homepage metadata). The grid and
category chips can render immediately without waiting for Supabase. Live data
still refreshes in the background; cart additions wait for that refresh, and
product deep links show built photos and copy immediately, then reconcile against
the live catalogue (including removing unpublished products). While interactive
detail controls load, a lightweight photo/details preview remains visible.
A refresh failure
keeps the snapshot visible and shows the error instead of reverting to bundled
legacy products. The logo and hamburger Home/collection links navigate within
the loaded shop, preserving real link destinations for modified/new-tab clicks.
Product-wise display ordering is unchanged.

The database and images are backed up daily, and the backup is test-restored
monthly. Setup and restore steps are kept in the private operations notes.

Before any new product, variant, gallery or AI-generated image is published,
an unwatermarked, processed WebP is archived in a separate private R2 bucket
(up to 6 MB), configured through the server-side `R2_ORIGINALS_BUCKET`.
It uses the same 1600-pixel longest-side limit and 82% WebP quality as the
public image, without adding the watermark. Raw JPG/PNG uploads are not archived.
Neither an r2.dev URL nor a custom domain is enabled for this bucket.
Only authenticated catalogue admins can archive files through the Edge Function;
uploads cannot proceed if archival fails. The public watermarked
copy uses the same UUID on R2, linking it to
`<admin-id>/<uuid>/original.webp`. Removing a public photo does not
remove its archived original. Previously watermarked input cannot be unmarked:
upload a clean original if one is available.

Daily backups retain originals in `image-originals/` alongside public R2
copies in `r2-images/` in the private backup repository. The originals backup
requires the GitHub secret `R2_ORIGINALS_BUCKET` and R2 credentials with access
to both buckets. A manifest records the private originals for restore checks.
Neither backup deletes images that disappear from live storage. The existing
pre-watermark originals remain in the older `r2-images/` backup paths.

## Google Merchant Center

Deployments generate `https://luviacreations.com/merchant-feed.xml`, a Google
RSS product feed. Add it as a scheduled file data source in Merchant Center
(English, India, INR; daily fetch). Each priced published variant has a stable
ID, its own static `/shopping/` landing page, matching price and stock, description,
brand and a clean WebP `image_link`. Price-on-request products are excluded with
a build warning. Reviewed photos containing promotional text are listed in
`scripts/merchant-feed.mjs`: the feed uses an alternate variant gallery photo
where available, otherwise excludes the item with a warning until a plain photo
is uploaded. New uploads should be reviewed for Google image-policy compliance.
Invalid descriptions, prices or missing clean images fail
deployment rather than publishing incomplete items. Handmade items without
assigned GTIN/MPN use `identifier_exists=no`; no identifiers are invented.

Only referenced clean processed photos are copied from private R2 to public
`/merchant-images/` files on GitHub Pages, with content-hashed names. The private
bucket and historical backups stay private, and the main catalogue retains its
watermarks. Each feed item also includes up to 10 unique additional photos from
that variant's ordered angle gallery as repeated `additional_image_link` fields.
Other variants' photos are not mixed in. Known text-overlay photos and duplicate
originals are excluded; additional images use the same clean-original validation
and AI metadata preservation as the main image. Google decides whether and when
to display these photos after fetching the updated feed.
Never upload watermarked inputs into the clean archive. Older clean
photos must first be restored from the pre-watermark backup to the matching
`<admin-id>/<image-id>/original.webp` key (or `static/<name>/original.webp`).
R2 credentials are available only to the separate server-side feed build step,
not the Vite client build. Catalogue-triggered deployments refresh the feed.
For local validation, run `npm run build` followed by
`node --env-file=.env.r2.local scripts/merchant-feed.mjs` with
`R2_ORIGINALS_BUCKET` set. For a one-time legacy restore, use
`node --env-file=.env.r2.local scripts/restore-merchant-originals.mjs --backup=<absolute-backup-path>`;
it verifies the sources in a dry run. Add `--apply` to upload and byte-verify
them in private R2; existing originals are never overwritten.

Shipping settings must be supplied in Merchant Center with actual delivery
prices/times; the feed does not invent them. The feed is not an approval
guarantee: Google reviews the website, images and policies, and WhatsApp-only
ordering may not meet its online purchase requirements.

## Collections and store information

The build prerenders `/collections/` and one landing page per admin category,
plus `/about/` (About & Contact) and `/faq/`. Each mounts the catalogue app with
the public build snapshot and refreshes categories and products from Supabase.
The catalogue refreshes automatically on return to a visible tab, reconnection,
and every 60 seconds while visible and online, on both the homepage and store
pages. Overlapping refreshes share one request; hidden tabs do not poll.
There is no manual Refresh catalogue control. Failed requests retain the last
available data, show an error and retry on the next automatic refresh.
The collections hub uses a compact photo grid with an actual published product
photo and live product count per category, rather than long category descriptions.
Collection product cards reuse the homepage variant, minimum-order, Add to cart
and Share controls. The header opens the same persistent cart and checkout drawer
without leaving the collection; cart errors and confirmations appear on these
pages too. Additions are disabled until current availability is confirmed.
The homepage also offers direct collection links below the product grid without
changing product-wise ordering. Empty collections are never promoted.
Compact collection and information headers keep the logo left-aligned on mobile,
consistent with product-detail pages.
Mobile headers use matching 48px logo, menu and cart circles; the larger desktop
homepage logo is preserved.
When the mobile catalogue toolbar sticks, the cart moves into its search row
instead of floating over the category chips. Categories retain the full row width,
and the empty cart remains reachable there after removing the last item.
The mobile footer groups navigation and contact actions into two columns, keeps
44px tap targets for primary links, and reduces spacing and repeated brand copy.
New/renamed/deleted categories and published products are not hardcoded.
Collection pages have their own descriptions, canonical URLs and matching
CollectionPage/ItemList structured data. They link to interactive product pages
and the existing category-filtered cart experience; manual product ordering is
preserved. Prerendered prices are labelled as snapshots; interactive pages
refresh price and availability, with final confirmation before payment.

All new pages are linked from the hamburger menu and footer and included in the
sitemap without adding duplicate query-filter URLs. As on the homepage, categories
with no published products are hidden from collection navigation and the collections
hub (including categories whose products are all unpublished in admin). Publishing
a product makes its collection visible on the next refresh. Empty category pages are
available only by direct URL, marked noindex and excluded from the sitemap; removed categories
show an unavailable message rather than displaying unrelated products. The
existing category/product database triggers request a rebuild to update static
pages and the sitemap. Newly added collection URLs use the 404 app fallback until
that build finishes. FAQs use accessible native
disclosures; no FAQ rich-result eligibility, maker biography, reviews, fixed
delivery times or automatic customisation availability is claimed. These pages
are readable without JavaScript and use no external widgets. Category names that produce duplicate
paths fail the build explicitly.

## Cart bot and abuse protection

Migration `20261006095000_protect_cart_activity.sql` validates every client cart
item against a published product and matching variant, and derives names, image,
slug and public price from catalogue records rather than trusting the browser.
Cart identity cannot be edited; activity dates and the 30-day expiry are assigned
by the database. Each authenticated session allows 60 successful cart/item writes
per minute and 10 cart creations per hour. An upsert and its subsequent cart
refresh can consume multiple writes. Carts allow at most 50 distinct variants.
Rejected transactions do not consume a write slot. These are per-user controls,
not IP limits: a new anonymous identity can evade them.

Admins can confirm **Block cart session** in Anonymous cart activity and later
unblock it, even after deleting the cart. Blocks stop cart writes and PIN lookups
but allow cart/item deletion. Luvia does not store raw IP addresses. This does not
block messages sent directly to WhatsApp/email, nor prove that an enquiry is real.

### Activating CAPTCHA

The on-demand Cloudflare Turnstile integration is disabled while
`VITE_TURNSTILE_SITE_KEY` is blank. Browsing and restoring an authenticated cart
do not load the widget. A fresh anonymous sign-in or admin password sign-in
requests a token; Supabase Auth must verify that token server-side.
When enabled, Turnstile processes browser/network information through Cloudflare;
its privacy policy applies. CAPTCHA makes automation harder, not impossible.

1. Create a Managed Turnstile widget allowing `luviacreations.com` and
   `www.luviacreations.com` (and localhost only if local testing is needed).
2. Add its public site key as the GitHub Actions repository variable
   `VITE_TURNSTILE_SITE_KEY` and rebuild/deploy the frontend.
3. Then enable Turnstile in Supabase **Authentication > Bot and Abuse Protection**
   using the widget's secret key. Never put the secret in a `VITE_` variable or
   commit it. Verify cart creation and admin login immediately after activation.

Deploy the frontend first so enabling Supabase CAPTCHA does not lock out users
with a current frontend. Older cached builds may need a refresh. If rolling back,
disable Supabase CAPTCHA before removing the frontend site key. Do not use
Turnstile's always-pass testing keys in production.

Run CAPTCHA UI/browser tests with
`npx playwright test --config playwright.captcha.config.ts`. The tests mock
Turnstile and verify token forwarding, retry/cancel and restored-session behavior;
they do not prove production secret-key configuration. Backend integration
checks use `supabase db query --linked --file supabase/tests/cart_activity.sql`;
fixtures and writes run in a transaction that is rolled back.

## Optional delivery pincodes

The cart offers an optional delivery PIN code with explicit Save/Clear controls.
The compact saved view shows the PIN and postal area with Change/Clear actions.
The editor opens only when needed, and the full provider/storage disclosure is
available under "How we use your pincode". Saving/clearing is announced to screen
readers without adding a separate visible confirmation row.
Only six-digit Indian PIN shapes are accepted. Saving a nonempty PIN calls the
authenticated `verify-delivery-pin` Edge Function, which verifies the cart owner
and checks existence using `https://api.postalpincode.in/pincode/{pin}`.
This is a third-party postal-data API, not an address verification service.
Only the PIN is sent upstream; no cart IDs, user IDs, IP addresses or GPS are sent.
Successful postal areas are cached for 30 days. Lookups are limited to one per
active cart every 10 seconds and have an 8-second upstream timeout. Missing PINs
and outages produce explicit errors; failures never overwrite saved data.
Saved PINs are included in WhatsApp/email enquiries and shown in admin as
shopper-provided; checked PINs also show district(s), state(s), country and the
postal lookup date. This is not a verified shopper address or shipping quote.
Existing PINs remain unverified until the shopper saves them again.
They share the cart's 30-day lifetime and are cleared on cart deletion/renewal.
No raw IP addresses or GPS coordinates are collected. Apply migration
`20261006090500_add_cart_delivery_pin.sql` and
`20261006092000_verify_cart_delivery_pins.sql`, then deploy
`supabase functions deploy verify-delivery-pin` before deploying the frontend.
The database rejects direct client writes of nonempty PIN/location fields, so
clients cannot bypass verification or forge a checked postal area. Clearing all
PIN metadata remains available without the upstream API.

## Product customisation enquiries

Product quick views and full details offer a WhatsApp customisation enquiry.
The message includes the product, selected variant and a prompt for the desired
colour/change; availability, price and dispatch remain subject to confirmation.
Customisation clicks are enquiries, not confirmed orders or purchases.

## AI product image generation

The admin console can generate studio and lifestyle product photos from uploaded
reference images using the `enhance-product-image` Supabase Edge Function. It
supports Google Gemini, OpenAI and Cloudflare Workers AI, falls back between
them on quota limits or errors, and keeps API keys in Edge Function secrets.
Use **Copy prompt** beside **Optimize prompt with Gemini** to copy the current
styling instruction, including any selected style suggestion or Gemini-optimized
text. Copying does not generate an image or save changes; clipboard errors are
shown explicitly.

## Product specifications and Gemini suggestions

Add product and Manage products > Edit share optional Materials, Dimensions,
What's included and Care instructions fields (up to 1,000 characters each).
Existing products need no backfill; blank values do not create customer sections.
The admin preview uses the same collapsible detail sections as the product modal.

Enter verified facts in **Confirmed facts for Gemini** (up to 2,000 characters),
then choose **Suggest details from photo & notes**. Review and select individual
suggestions before applying them to the draft. Existing values are unchecked by
default; selecting them explicitly replaces their draft values. Applying a
suggestion does not save or publish the product. Unknown specifications stay
blank; photos alone cannot establish fibre composition, dimensions, package
quantity or care instructions. Price, stock and dispatch estimates remain manual.
Gemini edits shorthand into customer-ready wording and combines visible features
with confirmed facts in the description. It must not expand a bare measurement
into an assumed height or add unconfirmed care advice. The review lists details
that still need confirmation; add or clarify facts before generating again.

The add/edit forms also include an optional **SEO description** with a live
character count and a 160-character limit. Gemini generates it alongside the
full description, and it follows the same selective review/apply flow; existing
SEO copy is never replaced without selection. Aim for a specific, natural
120-155-character summary with a complete sentence and confirmed facts.
Shorter summaries are valid. The prompt prohibits keyword stuffing, HTML,
ellipses, invented specifications, safety/age claims, reviews, discounts and
shipping promises. Server and client validation reject missing, oversized,
markup-containing or unfinished SEO suggestions rather than truncating them.
These checks cannot prove factual accuracy: an admin must still review the copy.
This is a writing limit, not a Google ranking requirement; Google can rewrite
the displayed search snippet.

**Bulk descriptions with Gemini** in Manage products works on selected products
from the current search results (1-100 per batch). One Generate click processes
photos sequentially using existing confirmed facts and generates both full and
SEO descriptions. Review/edit suggestions, uncheck any you do not want, then
choose **Save all approved changes**. Failed generations are listed and excluded.
Use **Retry** beside a failed product or **Retry all failed** after the current
operation finishes. Retries preserve successful suggestions, review edits and
approval choices; recovered suggestions still need review and an explicit save.
Stop finishes the current request and keeps completed suggestions; Discard saves
nothing. Generation may incur Gemini usage charges.

Bulk saves use the admin-only `bulk_update_product_descriptions` RPC from migration
`20261005170000_bulk_product_descriptions.sql`. The save is a single transaction:
if a selected product's existing description/SEO copy changed or it was deleted
after generation, the whole batch is rejected without updates. Only descriptions
and SEO summaries are written; names, categories, specifications, price, stock,
photos and manual display order are untouched. The existing rebuild trigger
refreshes static metadata after saving.
Database regression checks are in `supabase/tests/bulk_product_descriptions.sql`;
run with `npx supabase db query --linked --file supabase/tests/bulk_product_descriptions.sql`.
The fixture requires two existing admin-owned products and rolls back every test
write and rebuild notification.

Deploy the optional-detail migration (`20261003170000_add_optional_product_details.sql`)
and the SEO-description migration (`20261005160000_add_product_seo_description.sql`)
and the updated `analyze-product` function before publishing the frontend:

```sh
npx supabase db push --linked
npx supabase functions deploy analyze-product --use-api
```

The existing Gemini secret and admin authentication are reused for Gemini
workflows; no provider API key is exposed to the browser. Product details also
appear on generated product pages when supplied, without changing existing
product routing.

The admin **Price discovery** panel can search GST Accelerator's HSN/GST
dataset using the product name, category and confirmed details. Configure
`GST_ACCELERATOR_API_KEY` in the Supabase project's Edge Function secrets before
deploying `analyze-product`; never put the provider key in frontend environment
variables, source control or browser code. The panel displays HSN candidates,
tax components, confidence and any conditions for admin review. Applying a
rate only changes the draft estimate and does not save the product.
The lookup emphasizes the finished product's use, category and confirmed
materials rather than treating "handmade crochet" as an HSN by itself. Clearly
unrelated descriptions are discarded; if there is no relevant or unique HSN/rate
match, the calculator asks for manual verification instead of offering a rate.

After all time, cost and GST inputs are valid, choose **Suggest price** to see
the rounded recommendation. The suggested selling price is editable; profit
and margin update as it changes. Margin is estimated profit after product costs,
GST and payment fees divided by the selling price before GST. The default
shipping and packaging inputs are ₹100 and ₹10 respectively.

Admin margin labels are green (**Good**) at 35% or above. Below that threshold,
they use a gradual red tint (**Below 35%**): very light near 35%, increasing
as the margin drops to zero; negative margins retain the strongest tint.
This applies to saved product margins, price
discovery estimates and targets, editor estimates, and sales dashboard margins.
Unavailable margins remain neutral. Colors use the unrounded margin, not its
rounded display value; this is a visual guide and does not change pricing.

Product cards prominently show **Profit margin** and a **Suggested price for
minimum 35% margin**. The suggestion is rounded up to whole rupees, includes GST,
and uses the current Price discovery costs and fee defaults for a one-piece order.
It does not change the saved price or the calculator's chosen target margin.
Products without valid time, cost and GST inputs show a prompt to complete
Price discovery instead of a guessed price.
The compact note reads "GST included · Estimate for 1 piece". The Price discovery
summary also shows the estimated margin at its rounded suggested price, rather
than just the target margin.

The Products workspace includes a **Needs attention** summary, visible even when
Manage products is collapsed. Its clickable counts filter products with saved
margins below 35%, missing/invalid saved pricing inputs, or low/out-of-stock
variants (low stock means fewer than 3 available pieces: 1–2 pieces; zero is out of stock). A product marked out of stock
also appears in the stock filter. Counts include hidden products and count each
product once per group; a product may appear in more than one group. Searches
combine with the selected filter. **Show all products** clears the attention
filter; clear search too to restore product reordering. Pricing checks use saved
inputs, not unsaved calculator drafts. Zero costs are valid, not missing.

### Business expenses

Open **Admin → Sales → Sales dashboard → Business expenses** to add, edit or
delete monthly overheads (advertising, tools/equipment, subscriptions, rent,
utilities or travel). Date, description, category and amount paid are required;
notes are optional. Deletion requires confirmation. Expenses share the dashboard
month selector, and saving an expense selects its month.

**Estimated sales profit** remains revenue before GST minus recorded sale costs
and fees. **Profit after business expenses** subtracts that month's overheads;
its margin uses revenue before GST and is unavailable when no sales revenue
exists. A month with expenses and no sales shows a loss, not zero profit.
Enter totals paid including taxes. This is a management estimate: no GST input
credit, depreciation or income-tax calculation is performed. Do not record costs
already included in individual sales again as business expenses.

Expenses are stored separately in the admin-only `business_expenses` table,
not product pricing or sales snapshots. Apply migration
`20261008024000_create_business_expenses.sql` before deploying this frontend.
Expense records are not included in the existing **sales** CSV export/import.
Load failures show an error and unavailable overhead totals, with **Refresh
dashboard** to retry, rather than treating unavailable expenses as zero.

### Quarterly and yearly snapshots

Open **Admin → Snapshots** for **Quarterly & yearly snapshot**, expanded by default.
Select a calendar year to see its annual total and Q1 (Jan–Mar), Q2 (Apr–Jun),
Q3 (Jul–Sep), and Q4 (Oct–Dec) cards. This is not an April–March financial-year
report. Years with sales or expenses, plus the current year, are selectable.
The snapshot is independent of the monthly filter and does not change the sales CSV.

Each period shows GST-inclusive revenue, sales/pieces, GST collected, estimated
sales profit, overheads, profit after expenses, and the margin after overheads.
Dates determine the period, not record creation timestamps. Margins are calculated
from aggregate revenue before GST, not averaged from individual sale margins.
Expense-only periods show losses and no margin. Current/future quarters show
only recorded data, not forecasts. Snapshots update after sales/expense changes;
The snapshot reloads when opening its tab; **Refresh snapshots** loads changes
made elsewhere while viewing it. Monthly sales and expense entry remain in Sales.
Sales and expenses are paginated
to avoid truncating annual totals. Failed loads do not show a zero-valued snapshot.

To configure the secret, use **Supabase Dashboard → Edge Functions → Secrets**
and add `GST_ACCELERATOR_API_KEY`. Then deploy the function with the command
above. A frontend deployment does not deploy Edge Functions.

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
Product sitemap `lastmod` uses the stored `updated_at` timestamp (UTC date), not
the deployment date. Migration `20261003180000_track_product_page_modifications.sql`
tracks product, variant and gallery changes, including removals. Existing dates
are backfilled only from known variant edits/gallery creation times; historical
gallery edits without recorded timestamps cannot be reconstructed. Missing edit
dates fall back to publication; if neither date is valid, `lastmod` is omitted
with a build warning.
Shared product links use these pages so link previews show the product photo
(an 800px `og.jpg` written beside each page). These pages contain static product
content and metadata for crawlers and visitors without JavaScript, then boot the
interactive product view on the same URL without redirecting to the homepage.
Product search and social descriptions prefer a saved admin SEO description
(`seo_description` in the database). Leaving it blank or clearing it uses the
automatic fallback; existing products need no bulk edits. This override applies
to static product/alias and Merchant variant pages and interactive product
metadata, without replacing the full product description, Product schema copy
or Merchant feed description. Updates use the existing catalogue rebuild trigger.
Automatic descriptions use complete short descriptions or a
complete first sentence. When the product copy cannot supply a concise sentence,
they use the product name, collection and India shipping statement instead of
cutting text mid-sentence. The interactive view uses the same summary logic.
Public product and Merchant variant URLs use persistent, unique slugs instead of
database IDs. Migration `20261004100000_add_stable_public_catalogue_slugs.sql`
backfills product and variant slugs once and preserves them across renames.
The Merchant feed retains its existing UUID-based `g:id` and grouping IDs so
Google can match existing listings; only the shopper-facing `g:link` changes.
Previously shared UUID-based product URLs remain available as canonical aliases.
Legacy Merchant URLs are generated as canonical aliases and older variant links
fall back through the Pages 404 bootstrap.
The product page stacks photos and details on mobile and uses two columns on
desktop. Product detail breadcrumbs link Home to the catalogue and the category
to its `/?category=...` filter, with the product marked as the current page.
Static pages and BreadcrumbList schema use the same category destination.
The header navigation button opens Home, current collection filters and the
return policy without replacing catalogue category chips. The disclosure closes
on Escape, outside clicks, link selection or opening the cart.
Its gallery, zoom, variant picker, specifications, cart and sharing
controls are the same component used by the catalogue popup.
Specifications and care instructions are always visible on the full product page;
the catalogue quick view keeps these sections collapsible. Empty fields stay hidden.
The full product page uses a compact top-left logo with the cart on the right.
Quick WhatsApp enquiries from the popup and full page include the selected variant
name and a product-page URL targeting that variant. Static page order links also
include their landing-page URL; general contact and cart messages are unchanged.
Product enquiries use a short interest sentence followed by the URL, without a
category sentence or "Product:" label. The URL enables WhatsApp's link preview.
Below the product, **More from this collection** shows up to four other published
products in the same category: in-stock first, then newest publication, with ID
as a stable tie-breaker. Missing/invalid publication dates sort last within their
stock group. No unrelated-category filler is used; an empty section is hidden.
Recommendations open full product pages in-session, retaining the cart and
catalogue return state. The grid has two mobile columns and four desktop columns.

Catalogue clicks still open a quick view. **View full details** carries the chosen
variant into the full page (`?variant=<id>`); **Back to collection** restores the
in-session search, category and scroll position. Shared/admin/cart links use the
full page. Legacy `/#product=...` links still open popups. Pages not generated yet
bootstrap via the 404 handler, resolve the current published product by immutable
ID, and restore the product URL. Missing/unpublished products show an explicit
unavailable message. Merchant `/shopping/` landing pages remain static and unchanged.

For AI discovery, the site publishes [public/llms.txt](./public/llms.txt).
During each build, the prerenderer replaces its catalogue markers with the
published categories and product-page links, including visible price ranges
in INR and stock status. It also updates the homepage meta descriptions from
those categories, so unpublished categories are not advertised. Contact details
remain in the template; WhatsApp enquiries link to the catalogue's contact
buttons rather than publishing a mobile number in the discovery file.
Stock wording follows the catalogue's "In stock" / "Sold out" status and does
not promise made-to-order fulfilment or immediate dispatch.
Each static product page includes Product JSON-LD with its visible price and
availability, plus breadcrumbs. The sitemap contains URLs and `lastmod` only.

The approved return policy is published at `/return-policy/` from
[public/return-policy/index.html](./public/return-policy/index.html). It is
linked in the footer, discovery file and sitemap and is excluded from the
service worker's SPA navigation fallback. When terms change, update the policy's
effective date and its sitemap `lastmod` in both the public sitemap and prerenderer.
Merchant Center return settings must match the published policy.
