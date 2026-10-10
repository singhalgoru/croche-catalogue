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
- Cart additions, quantity changes and removals return the server-validated cart from the refresh write, avoiding an extra sequential reload before updating the UI.
- Successful cart additions paint their confirmed cart feedback before running third-party analytics, keeping tracking work off the mobile feedback path.
- The cart shows products before pincode/address controls. A compact fixed footer keeps the estimated total and WhatsApp/email actions accessible; the expandable price breakdown and clear-cart action stay in the scrolling body.
- Admin products show all-time pieces sold from saved sales linked by product ID, across variants, dates and channels. Creating, editing, deleting or importing sales refreshes the counts; unlinked manual sales are excluded and stock is unchanged.
- Reddit variant links use dedicated static variant pages with matching preview images, titles and prices. Visitors open the selected variant in the interactive product view; existing query-based links remain supported. Reddit may retain cached previews on older posts.
- Mobile store pages use equal-width collection links and aligned ordering-policy links; About ordering disclosures are grouped in a readable panel.
- When Turnstile is configured, bot verification is prepared while browsing. A prepared token is consumed once within four minutes; missing/expired tokens still require the verification dialog before anonymous signup.
- Product views, Google feed landing pages, About and FAQ explicitly disclose the catalogue/order-request model, GST-inclusive prices, additional shipping and payment confirmation. These transparency disclosures do not provide a complete online checkout or guarantee Merchant Center eligibility.
- "Collaborate with us" in the hamburger menu and footer links to a maker/brand invitation above the footer, with a prefilled collaboration WhatsApp enquiry using the existing contact number
- Dedicated order and WhatsApp contact: +91 9205907350
- Email contacts for orders and general enquiries
- Installable app experience on supported browsers

## Razorpay payments

### Standard Checkout webhooks (test mode)

With public checkout hidden, signed-in catalogue admins can use **Admin →
Settings → Razorpay test payment**. Open the shop while still signed in, add
priced available items, return to Settings, and select **Load my cart for test
payment**. Enter the test buyer name/mobile and open the existing Razorpay
test modal. Only the admin's own cart is used; other customer carts are not
impersonated. This tool does not require enabling the public checkout flag.
After a test payment, check Razorpay's webhook delivery logs for HTTP 200.

The existing `razorpay-payment-webhook` function now accepts `payment.captured`
and `order.paid` alongside its Payment Link events. It verifies HMAC-SHA256
over the untouched request body with `RAZORPAY_WEBHOOK_SECRET`, validates captured
payment/order details, and reconciles against the stored order amount/currency.
Event IDs are deduplicated transactionally; callbacks and webhook retries can
both verify the same payment safely. Unknown orders and database failures return
retryable errors rather than losing the notification.

Apply `20261010090000_add_checkout_webhook.sql`, set a unique backend-only
`RAZORPAY_WEBHOOK_SECRET`, and deploy `razorpay-payment-webhook` with JWT
verification disabled (Razorpay authenticates through the signature).
The deployed test secret is saved locally as `RAZORPAY_WEBHOOK_SECRET` in the
ignored `.env.razorpay.local`; copy it into the Test-mode dashboard secret
field without committing it or exposing it to the frontend.
In **Razorpay Dashboard → Test mode → Settings → Webhooks**, add:

`https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/razorpay-payment-webhook`

Enter the same webhook secret and subscribe to **payment.captured** and
**order.paid** for the current Standard Checkout test flow. Test a payment,
check the stored `test_verified` status, and resend the event to confirm that
it causes no duplicate side effects. Invalid signatures return 401.
This is not a Live-mode webhook: test reconciliation does not reduce stock,
redeem coupons, clear carts or record sales, and public checkout stays hidden.
Live checkout and its inventory/coupon settlement still require a separate
activation step. Payment Link subscriptions should remain on their existing
link-specific events; do not subscribe an unrelated payment integration to
this test-order endpoint.

Reference: [Razorpay webhooks](https://razorpay.com/docs/webhooks/).

The existing `payment-integration` backend foundation is reused: hosted payment
links and Standard Checkout share `payment_orders` and `payment_order_items`.
Admin payment links still require a confirmed customer and shipping charge.
Their signed webhook handles reservations and real inventory settlement.

Standard Checkout is **test-only**, opt-in, and does not place a real order,
reserve stock, clear the cart or create sales. The backend rejects live keys.
Its amount comes from current published product/variant prices, minimum order
quantities, available inventory and server-stored indicative shipping, never
from browser-supplied amounts. Owner-only signature verification additionally
checks Razorpay's captured payment, currency, order and amount. Verified tests
are recorded separately as `test_verified`, not `paid`.

Setup:

1. Apply migrations with `npx supabase db push --include-all`.
2. Put test credentials in ignored `.env.razorpay.local`:
   `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...`.
   Rotate any secret previously pasted into chat. Never prefix the secret with
   `VITE_` or store it in GitHub frontend build variables.
3. Run `npx supabase secrets set --env-file .env.razorpay.local`.
4. Deploy `create-order` and `verify-payment` with `npx supabase functions deploy`.
   These are the Supabase equivalents of `/api/create-order` and
   `/api/verify-payment`.
5. Set `VITE_ENABLE_RAZORPAY_TEST_CHECKOUT=true` in local `.env.local`, or as a
   GitHub repository variable for the Pages build, then rebuild.

To test, add priced, available products to a cart, open the cart, enter a name
and Indian mobile number, and select **Try Razorpay test checkout**. Use
Razorpay's test payment methods only. Check cancellation, payment failure and
success; success must say no money was charged and no order was placed.
If verification fails, use **Retry payment verification**, not a new payment.
Same-tab reloads retain pending verification in session storage. An ambiguous
provider order-creation failure is held for review rather than automatically
creating another chargeable order.

Validation commands:

```powershell
npm test -- checkout.test.ts RazorpayCheckout.test.tsx
npx supabase db query --linked --file supabase\tests\razorpay_checkout.sql
```

Before enabling live checkout, complete Razorpay onboarding and the production
configuration and validation below. Live checkout is gated separately from test
checkout; refunds and dispatch/delivery tracking remain manual.
The hosted-link foundation has its own `create-razorpay-payment-link` and
`razorpay-payment-webhook` functions; its webhook uses the separate backend
`RAZORPAY_WEBHOOK_SECRET` and the `payment_link.paid`, `payment_link.expired`
and `payment_link.cancelled` events. Do not enable hosted links without testing
that complete admin-to-webhook flow.

## Customer order funnel and welcome email coupon

### Live Razorpay checkout (disabled until configured)

Live checkout follows **cart → delivery address → coupon/shipping review →
Razorpay → backend verification → order confirmation**. Guests can pay with their
owned cart session; ILOVELUVIA still requires a verified registered account.
The backend uses current published product prices, stock, saved delivery details
and coupon eligibility. Shipping is free at an items subtotal of ₹500 after
discounts; below this, the current saved courier estimate rounded up to ₹10
applies, or ₹100 without an estimate. These are the amounts collected at checkout.

`checkout_settings.live_enabled` is false by default. While disabled, the
existing enquiry flow remains available and admin test checkout is unchanged.
Enable only after the following production configuration and checks:

1. Set Supabase Edge Function secrets `RAZORPAY_LIVE_KEY_ID` (starts with
   `rzp_live_`) and its matching `RAZORPAY_LIVE_KEY_SECRET`. Keep the existing
   `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` test pair separate. Never put secrets
   in frontend variables or source control.
2. In Razorpay **Live mode**, set automatic payment capture and configure
   `https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/razorpay-payment-webhook`
   for `payment.captured` and `order.paid`, using the matching Supabase
   `RAZORPAY_WEBHOOK_SECRET`. Confirm webhook delivery and retries.
3. Deploy `create-live-order`, `verify-live-payment` and
   `razorpay-payment-webhook`, apply the live-checkout migration, and run
   `supabase/tests/live_checkout.sql` (transactional; fixture changes roll back).
4. After the business approves the shipping rule and credentials/webhook are
   verified, set `checkout_settings.live_enabled=true` via the service/admin
   database console. Make a supervised real payment, check order history,
   inventory and coupon use, and verify duplicate webhook delivery is harmless.

Live orders reserve stock for 30 minutes. Only a captured payment verified by
signature, provider order ID, amount and currency can settle stock and coupon
use atomically. Browser verification and signed webhooks share the same
idempotent settlement. Late captures or insufficient stock become
`review_required`, not confirmed orders; an operator must reconcile/refund them
before fulfilment. Ambiguous provider-creation failures stay held for review:
do not clear their claim or create a new order until checking Razorpay.
Unpaid/cancelled payment attempts do not consume coupons or deduct inventory.
If cart details change after checkout starts, the backend can replace an earlier
order only after Razorpay reports no attempts, no paid amount and no payments.
The old local order is cancelled and its reservations released in the same
transaction that prepares the replacement using current cart prices, address,
coupon and shipping. Replacement retries retain their request key. Razorpay
orders themselves cannot be revoked by this local cancellation: close older
payment windows and use only the latest checkout. Any late capture for a
superseded order goes to payment review, never automatic fulfilment. Orders with
attempted payments or uncertain provider creation remain blocked for reconciliation.
An unchanged cart is cleared on confirmed payment; concurrent cart edits are
preserved. Refreshing or losing the browser callback does not lose settlement:
the signed webhook records payment and the browser checks its owned order status.
Admin → Orders includes an **Online orders** list with payment status, saved
delivery address, contact details, products and totals, including review-required
attempts. Only paid orders should be fulfilled.
The admin Online orders panel and individual order details are collapsible.
Awaiting payment starts when a provider checkout is created; unpaid live
checkouts expire after 30 minutes (a scheduled worker persists expiry every
minute). Expiry is not a paid-order cancellation or refund. Ambiguous provider
creation remains held for reconciliation. Superseded unattempted checkouts are
cancelled when the cart is repriced. Admins may confirm **Remove from list** for
cancelled, unpaid live entries; this hides them without deleting the payment
ledger or customer history. A subsequent status change, including a late
capture requiring review, makes the entry visible again.
Customer communication uses the confirmed order's `LUV-...` order ID; internal
cart UUIDs and cart references are not included in customer email, enquiry
subjects/bodies or WhatsApp support messages. Cart identifiers remain internal
for persistence, recovery and admin investigation.
Confirmed live orders queue separate confirmation emails for the saved customer
email and `orders@luviacreations.com`. Online checkout requires a contact email.
The queue is transactionally created on settlement, including webhook recovery,
and duplicate settlement does not create duplicate messages. The
`order-confirmation-worker` runs every minute using the existing Resend sender,
`RESEND_API_KEY`, `WELCOME_COUPON_FROM_EMAIL`, and the welcome worker's private
`CUSTOMER_WELCOME_WORKER_SECRET` / Vault `customer_welcome_worker_secret`.
No extra sender credentials are required. Delivery failures retry up to eight
times at 15-minute intervals and remain recorded in `order_confirmation_emails`;
operators should monitor `last_error` and exhausted attempts. `accepted_at`
means Resend accepted the email, not proof of inbox delivery. Retries use a stable
Resend idempotency key; its provider retention limits still apply.
Dispatch/delivery tracking is not enabled. Automatic WhatsApp messages require
an official Business API provider, approved templates and customer opt-in; no
automated WhatsApp delivery is configured by this change.

The header account dialog includes a paginated **Your orders** section for
recorded, non-test payment orders. The customer-only `get_customer_orders` RPC
matches the saved customer owner or the signed-in, verified email and returns saved order
items, totals and payment status without exposing internal payment identifiers.
WhatsApp/email enquiries are not treated as confirmed orders; dispatch/delivery
tracking is not recorded yet. Customers can refresh the history for current status.
Order ownership is retained even after the original cart expires or is deleted.

If a selected coupon's minimum items value is not met, checkout shows the
additional items value required beside the coupon field and labels the coupon
as not applied. Shipping is excluded from that minimum; the message updates as
the cart value changes.

Admin → **Customers** shows registered customer totals, verified accounts,
active signups awaiting activation and welcome emails sent, plus a paginated
customer list with contact details, registration/sign-in dates and welcome-email
status. `get_admin_customer_summary` enforces catalogue-admin access in the
database; anonymous guests and expired, unactivated signup drafts are excluded.

Customers can continue as guests: contact details → Indian delivery address →
review → WhatsApp/email order request. Details are saved against the owned
cart, restored on return and visible to catalogue admins. Saving checks the
pincode through the existing postal/shipping service; changing the pincode
invalidates the old address so destinations cannot silently diverge. Addresses
are private, removed with their cart, and cleaned up after cart expiry.

Email signup is optional. It upgrades the existing anonymous Supabase identity
with `updateUser`, preserving cart ownership. A verification link (or
email-change code) confirms the account. Returning customers use passwordless
email sign-in from an empty cart. Signing into another account is blocked while
the current cart has items; carts are not silently merged or discarded.
On an empty cart, enter the registered email and select **Send sign-in link**;
open the emailed link in the same browser to restore the saved account/cart.
When signup and sign-in are both available, the selected account option is
visibly marked. Delivery errors are reported inline rather than claiming success.
Catalogue URL cleanup preserves auth callback credentials until the lazy
Supabase client consumes them, preventing email links from losing the session.

Configure Supabase Auth's Site URL and allowed redirects for
`https://luviacreations.com/` and local development. Set up production SMTP
before promoting signup. The **Change Email Address** template can include
`{{ .Token }}` for code entry alongside `{{ .ConfirmationURL }}`. Test link
verification in the same browser and returning-account sign-in.

The welcome offer is **disabled by default**. Admin → Settings contains
configurable percentage, cap, minimum items subtotal and validity; the initial
proposal is 10%, capped at ₹100, minimum ₹500, valid 30 days. Do not enable
until the business approves those terms and account email verification is tested.
Coupon email delivery is optional; direct code entry does not require Resend.

For coupon emails, verify a sending domain with Resend and set backend-only
Supabase secrets `RESEND_API_KEY` and `WELCOME_COUPON_FROM_EMAIL` (e.g.
`Luvia Creations <welcome@your-verified-domain>`), then deploy `welcome-coupon`.
No new email credentials belong in frontend environment variables. Customers
explicitly request the coupon email; signup does not subscribe them to marketing.
The UI never claims an email was sent if provider configuration or delivery fails.
Provider acceptance is not a guarantee of inbox delivery.

The first-order code is **ILOVELUVIA** (case-insensitive on entry). All customers
see the same name, but separate private records enforce one redemption per
verified, normalized email address, not per browser session. Claims and
email retries are idempotent. Returning paid customers are excluded. Coupons
are attached to the owned cart and shown as **requested**, not automatically
subtracted from indicative customer totals. The admin-confirmed hosted payment
link applies the snapshotted coupon rules server-side, reserves it against
pending links and redeems it atomically only after a valid paid webhook.
Expired/cancelled links release the reservation; test checkout never consumes
coupons. Future live Standard Checkout must reuse this redemption logic.

Coupon email delivery remains unavailable until the external email credentials
are configured. Razorpay checkout remains hidden while the account is inactive.

Admin → Settings also has **Generate discount coupons**. Random codes have
immutable discount terms, an exact expiry date/time (entered in the admin's
local timezone and stored in UTC), a total redemption limit, and optional
first-order-only eligibility. Codes can be copied/shared manually and disabled
for new orders. Customers enter them after saving delivery details.
First-order-only codes require verified email; general codes support guests.
The backend rechecks expiry, eligibility and available redemptions when an admin
creates the confirmed payment link. Pending links count against the usage limit;
expired/cancelled links release capacity. Already-issued links retain the agreed
discount until their own link expiry. Only one coupon can be selected per cart.
Admin codes do not depend on the welcome-email provider. Verified customers can
also enter ILOVELUVIA directly while the offer is enabled; sending a coupon email
is optional and is not needed to enforce the one-use-per-email limit.

While Razorpay is inactive, admins can open the customer cart in **Orders** and
select **Mark coupon used for paid offline order**. Explicit confirmation is
required after checking the completed payment and coupon terms. This records
an audited redemption without pretending to charge money or changing inventory.
It shares the same email eligibility and random-code usage limits as payment
links, preventing reuse on another cart. Pending payment links cannot be
manually redeemed; their signed webhook remains authoritative.

```powershell
npm test -- CustomerFunnel customer.test welcome-coupon
npx supabase db query --linked --file supabase\tests\customer_funnel.sql
npx supabase db query --linked --file supabase\tests\campaign_coupons.sql
npx playwright test customer-funnel.spec.ts
```

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
a download, and lets you copy the title, product description and product link
separately. Expand **Product description** to select the text manually if clipboard
access fails. Paste the description into the Reddit body, caption or a comment;
the link-post option does not prefill it. Reddit
may discard Web Share titles/captions, so paste the copied title into its title
field and attach the downloaded photo if needed. The separate link-post option
prefills a title but cannot guarantee a Reddit image preview. No post is
published automatically.

Reddit helper links (Copy product link, native photo sharing and the link-post
URL) carry `utm_source=reddit`, `utm_medium=social`,
`utm_campaign=product_share` and a product identifier in `utm_content`.
Other sharing channels retain their normal URLs. Use the helper's tagged link
in the Reddit post body/caption/comment; a photo without a clickable product
link cannot attribute a site visit. Existing untagged posts are not retroactively
tagged.

In GA4, open **Reports → Acquisition → Traffic acquisition** and filter
**Session source / medium** to `reddit / social`. Sessions count visits; total
users approximates visitors and is not the same as clicks or Reddit post views.
Use campaign `product_share` and landing page or ecommerce item reports to
inspect product traffic and events such as `view_item` and `add_to_cart`.
Reporting depends on the configured GA measurement ID, browser tracking
availability and GA filters; blockers/internal traffic can be excluded, and
standard reports can take 24–48 hours to update. No separate admin traffic
dashboard or Reddit impression counter is added.

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
but allow cart/item deletion. Cart IP metadata is stored separately for admin viewing. This does not
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

Restoring an online cart is read-only: a missing or expired cart appears empty,
and a remote cart is created or renewed only on the first product addition.
The existing limits remain 10 new carts per session per hour and 60 writes per
minute. Rate-limit errors distinguish creation from changes and report the
remaining wait without extending the original counting window.

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
No GPS coordinates are collected. Network IP capture is separate from delivery lookups. Apply migration
`20261006090500_add_cart_delivery_pin.sql` and
`20261006092000_verify_cart_delivery_pins.sql`, then deploy
`supabase functions deploy verify-delivery-pin` before deploying the frontend.
The database rejects direct client writes of nonempty PIN/location fields, so
clients cannot bypass verification or forge a checked postal area. Clearing all
PIN metadata remains available without the upstream API.

### Approximate delivery charges (Shiprocket)

When Shiprocket is configured, saving a PIN also asks Shiprocket's courier
serviceability API (`cod=0`, prepaid) for rates from the pickup PIN to the
shopper's PIN. Only the PIN and an approximate parcel weight are sent. The cart
shows "Approx. delivery charge" (cheapest courier, rounded up to ₹10) with the
estimated courier transit days after dispatch (order preparation time is additional,
and delivery dates are not guaranteed); below the ₹500 free-shipping threshold this replaces the
flat indicative ₹100 in the cart, WhatsApp and email totals. Shipping charges
apply when the items subtotal after coupon discounts is below ₹500; at ₹500
or more after discounts, shipping is free. Coupon minimum-spend eligibility
still uses the items subtotal before discounts. The estimate is
tied to the cart quantity; when the quantity changes the cart falls back to ₹100
and offers "Update estimate". Admin carts show the min–max quote, weight and days.
There are no per-product weights yet: the billed weight is
`items × SHIPROCKET_ITEM_WEIGHT_GRAMS (150) + SHIPROCKET_PACKAGE_WEIGHT_GRAMS (100)`,
at least 500 g and rounded up to 100 g. Quotes are cached per PIN/weight for a
day, and the Shiprocket token is cached server-side. Shiprocket failures never
block saving the PIN; the cart simply keeps the flat fee.

Setup: in Shiprocket, go to Settings → API → Configure and create an API user
(a separate email from the panel login). Then apply
`20261008130000_add_cart_delivery_estimates.sql`, deploy `verify-delivery-pin`, and run:

```
npx supabase secrets set SHIPROCKET_EMAIL=<api-user-email> SHIPROCKET_PASSWORD=<api-user-password> SHIPROCKET_PICKUP_PINCODE=<pickup-pin>
```

Without these secrets the feature stays dormant.

## Product customisation enquiries

### Private cart network metadata

Nonempty online carts record the gateway-reported network IP once through the
authenticated `capture-cart-network` function without delaying cart actions.
The endpoint checks cart ownership, expiry, items and admin session blocks;
it accepts no client-supplied IP body field. Network metadata is not a verified
location or identity, and is never used for access decisions. GeoLite2 lookups run
locally on the server; no IP is sent to MaxMind or another geolocation provider.
Only admins can read `cart_network_details`; other shoppers
cannot read or write it. Admin carts show only a compact approximate location;
the raw IP and capture date remain stored but are not displayed.
Access expires 30 days after capture; an hourly pg_cron job purges expired
metadata, and cart deletion cascades immediately. No new shopper-facing notice
or popup was added. Apply `20261010032000_add_private_cart_network.sql` and deploy
`capture-cart-network` before deploying the frontend.
Run `npx supabase db query --linked --file supabase/tests/cart-network.sql`
to verify admin-only reads, denied shopper writes, expiry and the cleanup job;
all fixtures are rolled back.

For approximate city/region/country, create a free MaxMind GeoLite2 account,
accept its licence, download GeoLite2 City in MMDB format and extract
`GeoLite2-City.mmdb`. Upload that file via Supabase Dashboard Storage to the
private `geolocation-private` bucket under that exact name. Never make the
bucket public or commit the database. Apply
`20261010035000_add_cart_geolite_location.sql` and redeploy `capture-cart-network`.
The database reader is cached for one hour per function instance. Replace the
database regularly according to MaxMind's licence/update requirements.
Existing unlocated carts are enriched on their next visit without refreshing
their original IP capture date or retention. Missing database, lookup failures
and unknown IPs show "Unavailable" in admin, never a guessed location.
Admin displays GeoLite2/MaxMind attribution once below the cart list. No coordinates are retained.

The homepage Bestsellers section ranks available published products by pieces
recorded in the seller sales ledger over the last 90 calendar days, combining
variants and breaking ties by all-time quantity. Future-dated sales are excluded.
It shows at most four products and hides when fewer than two qualify, or while
searching/filtering. Featured remains manually curated. The ledger records actual
sales, not pending orders; remove or correct cancelled/returned sales in admin.
Product detail pages and quick views show a visible delivery/returns summary,
including preparation versus post-dispatch transit time, shipping thresholds,
and links to the existing FAQ and return policy. Product pages label the existing
same-category recommendations "You May Also Like"; stock priority, maximum four
suggestions and native product links remain unchanged.
Explore collections uses lazy-loaded visual tiles in category order, preferring
an available product photo and falling back to the first product when sold out.
Existing collection URLs and category filters are unchanged.
The public `get_catalogue_bestsellers` RPC exposes ranked product IDs only, not
quantities, customer data or financial details. Apply
`20261010024000_add_public_bestsellers.sql` before deploying the frontend.
Validate ranking, the 90-day cutoff, variant aggregation and anonymous access
with `npx supabase db query --linked --file supabase/tests/bestsellers.sql`.
This integration test requires six available products and rolls back all sales
fixtures without changing the catalogue.

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
The separate **Negative margin** filter shows only finite saved margins below
0%, excluding zero and missing margins. These products also remain included
in **Below 35% margin**. The same search, edit and clear-filter controls apply.

### Business expenses

Sale and expense dates are entered and displayed as **DD/MM/YYYY**, independently
of browser locale. Enter a complete valid calendar date (for example, `08/10/2026`).
Sales CSV exports use the same format; imports accept both this format and older
`YYYY-MM-DD` reports. Database dates remain `YYYY-MM-DD`.
Existing entries keep the same calendar date; the old browser date picker could
display `MM/DD/YYYY`, but it already saved ISO dates, so no data migration is needed.
Admin sale entry prefills saved product/variant prices even when the product,
category, or public price is hidden.

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
