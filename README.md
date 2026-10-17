# Luvia Crochet Catalogue

A mobile-friendly catalogue for Luvia handmade crochet products.

It lets visitors browse crochet products, view product details, check available
variants and angle photos, zoom images, and get in touch by WhatsApp or email.

© 2026 Luvia. All rights reserved. This repository is public for transparency,
but its code, brand assets, catalogue content, and product photography are not
licensed for reuse — see [LICENSE](./LICENSE).

## Features

Cron execution history retention is configured by
`supabase/migrations/20261016023000_limit_cron_run_history.sql`. It requires
`pg_cron` and prunes existing history on deployment. The follow-up migration
`supabase/migrations/20261016024000_run_cron_history_cleanup_daily.sql` sets cleanup
to run daily at 00:17 UTC (05:47 IST).
Each job retains its latest seven completed executions (successful or failed);
unfinished executions are left untouched. Schedules and business data are not
deleted. Between cleanup runs, more than seven completed entries may exist.
The cleanup function is not callable by public API roles. Validate with the
transactional `supabase/tests/cron_run_history.sql` test after deployment.

- Responsive product catalogue
- Compact mobile header and horizontally scrolling categories, with explicit WhatsApp ordering guidance
- Top-left mobile branding and a single sticky product ordering area; Share sits beside stock status above the ordering buttons, and the product close control stays visible
- A logo-only mobile brand row with a 64px logo and short header tagline keep browsing uncluttered; desktop retains the full introduction
- Category filtering and search
- Share category from a selected homepage category or its collection page, including seasonal collections. Supported devices open the native share menu; other browsers copy the canonical collection link to the clipboard, with visible feedback if sharing is unavailable or fails.
- Homepage collections feature a stationary, glowing seasonal collection card anchored at the start, while the remaining collections rotate continuously beside it in a ticker-style carousel with touch-pause, hover-pause, keyboard controls and a View all link.
- Search, All and New remain visible; other homepage category filters sit in a compact Filter by category disclosure.
- Every category supports an optional custom cover image. Homepage tiles, the collections grid, sharing and static social metadata use the same cover; without one, they use the first published product image in saved display order (not stock status). Empty categories remain hidden. Existing seasonal covers are preserved.
- Admin **Manage categories** offers **Edit image & overview** for regular categories and **Manage products** for seasonal ones. Upload a photo, select a published product from that category and place up to six **Shop-the-look hotspots** on the photo. Search, click-to-place, move/remove, and keyboard-editable percentage coordinates are supported. **Add at centre** is a keyboard alternative. Save publishes cover, hotspots and seasonal membership atomically; removing a seasonal product removes its markers. Replacing/removing a photo clears markers so old positions are never reused on a different photo. Old image renditions are cleaned after save, with explicit retry on cleanup failure.
- **Shop this look photo prompt** in either category editor lets admins choose up to six published category products independently of membership/hotspots, optionally describe each practical use and the shared setting, then generate/copy a prompt locally (no AI service or generation charges). Seasonal draft membership is supported before saving. Attach the numbered reference photos in the same order in an image tool. The prompt requires a cohesive practical-use scene, exact product pattern/size/colour preservation, realistic scale, a high-resolution square image and no baked-in hotspots or text. Reference links use each product's primary photo; use that same colour/design in the image tool. Edit scene/selection changes invalidate the old prompt. Review the generated image for product accuracy, upload it as the cover (converted to WebP by the existing upload flow), place hotspots, and save. Image generation itself is external and cannot guarantee product fidelity.
- Collection pages with a custom image and valid hotspots show **Shop this look** above the product grid. Tiny hollow white rings (no visible numbers or coloured fill) preserve the photo detail. A fine dark outline keeps them visible on light backgrounds; the visible ring is only 10px but its invisible tap target remains 44px. Keyboard-accessible product labels and focus outlines are preserved. Selecting a ring shows current product details plus a **View product** link. The redundant numbered product list is visually hidden; its links remain available to screen readers and become visible on keyboard focus. Admin markers retain numbers for precise coordinate editing. The full image keeps its aspect ratio so percentage positions stay aligned on mobile and desktop. Unpublished/deleted/non-member products are excluded, and private prices remain hidden. Plain fallback product images and untagged covers do not add a large image to the category page. Static pages retain accessible product hotspot links for crawlers and non-JavaScript visitors. Apply `20261016173000_category_images_and_hotspots.sql` and `20261016180000_preserve_explicit_category_hotspots.sql` before deploying the frontend; validate with the rollback-only `supabase/tests/category-hotspots.sql`.
- Live website rings use a white pulsing glow with a dark contrast edge and a hollow expanding ripple every 1.8 seconds, visible even on warm-coloured photos. The ripple fades as it expands to roughly 24px; no coloured fill covers the product. Rings keep their 10px hollow centre and 44px tap target. Reduced-motion users see a static halo and outer ring. Static fallback links remain plain rings.
- In **Shop this look**, both the selected product thumbnail and **View product** open that product's page. Thumbnail links are keyboard-accessible and use the same product-open promotion analytics as the button.
- Scene prompts explicitly exclude the Luvia/Luvia Creations logo and branding, including logos or watermarks present in reference photos.
- Category sharing always uses a clean photo: no hotspot markers, rings, glow, labels or overlays in native photo attachments or social link previews. Hotspots appear only on the website. Native attachments use the original WebP cover and include the collection link in the caption. Uploaded covers, public renditions and website images remain WebP. Only crawler-facing link-preview copies use JPEG for WhatsApp compatibility, matching existing product previews. If photo preparation fails or is incomplete, the UI explains that only the link can be shared. Preparation is keyed to the current image to avoid sharing a previous draft. Prerendering creates content-versioned clean link-preview images. Catalogue saves trigger the normal rebuild; messaging apps may retain a cached preview until they re-fetch the link. Image-generation failures emit explicit build warnings and retain the original cover/product photo in metadata instead.
- Bestseller cards show the full product image over a softly blurred backdrop, keeping embedded corner logos visible.
- Bestsellers uses the same smooth rotating carousel, with up to six sales-ranked available products, continuous ticker motion, touch-pause interaction, image-centered inset arrows and no native scrollbar lines. Search and category filters follow the carousel.
- Verified admins share catalogue management, including products, variants and gallery images, with MFA and audit protections retained.
- Admin product edits confirm the database update before reporting success and retain failed-save messages.
- FAQ explains AI-assisted lifestyle imagery and how to request actual product photographs before ordering.
- Create with Luvia welcomes maker, creator and partner enquiries without advertising unconfirmed job openings.
- The homepage keeps Bulk Orders & Corporate Gifting to a compact invitation near the bottom, with one "Explore bulk gifting" link to `/bulk-orders/`. Detailed copy, terms, email and WhatsApp options stay on the dedicated page, where the enquiry form opens immediately and prepares a Luvia-branded subject and body for `bulkorder@luviacreations.com`, plus a prefilled WhatsApp enquiry using the configured number. Customers review the draft and send it from their email app; the form does not send automatically or persist details on the server. A direct email link and copyable draft are available if no email app is configured. Footer links lead to the dedicated page; existing `/#bulk-orders` links still reach the homepage invitation. Quantity, budget, occasion and delivery date are requested; options and terms require confirmation. Shared copy and enquiry templates live in `src/content/bulkOrders.json`. The dedicated page is pre-rendered with contact links, canonical metadata and sitemap discovery.
- Browser favicons and installed-app icons preserve the original Luvia brand design.
- GA4 records cart/checkout intent and verified online purchases. Product/cart
  WhatsApp actions record leads, not completed offline purchases.
- Google Customer Reviews opt-in module prompts verified buyers on order confirmation to collect authentic delivery feedback for Google Seller Ratings.
- Below-catalogue ordering guide explains cart-to-WhatsApp confirmation and delivery enquiries, also present in the crawler-readable HTML; the return-policy link appears once in the footer
- Admin-controlled product order shared across the main catalogue and categories
- Manage products has All products and Featured products tabs with counts. Featured uses the saved featured flag, includes hidden products, supports search and existing edits, and updates after a feature is added or removed. Attention filters return to All products; display-order controls remain disabled while filtering.
- Product detail view with image carousel
- Catalogue and cart product links open full product pages with the shared gallery, variants, specifications and persistent cart; older homepage hash links retain their quick view.
- Optional materials, dimensions, package contents and care instructions, edited in Add/Manage products and shown in collapsible customer sections only when filled
- Gemini photo-and-notes suggestions use confirmed specifications, require selective review before applying, and never publish automatically or generate price, stock or dispatch promises
- Variant and additional-angle image previews
- Selected card variants stay fixed; automatic card previews are disabled for reduced-motion preferences
- Zoom and 3D-style image viewing
- Close image zoom by clicking/tapping outside the visible photo; image gestures and viewer controls remain active
- WhatsApp enquiry links
- Cart additions, quantity changes and removals return the server-validated cart from the refresh write, avoiding an extra sequential reload before updating the UI.
- Successful cart additions paint their confirmed cart feedback before running third-party analytics, keeping tracking work off the mobile feedback path.
- Full-width shopping journey: product → cart → delivery details → review & payment → verified order confirmation. Checkout steps use the `checkout` query parameter, support browser Back/Forward and survive refresh. Desktop uses a two-column summary; mobile stacks the panels without a cart overlay.
- Product details show Delivery and returns as a collapsed disclosure. Expand it with a click, tap or keyboard to read the shared dispatch/shipping guidance and unchanged return policy links.
- Full product pages keep the share icon in the fixed bottom purchase bar so it remains available while scrolling; modal sharing retains its existing action-row placement. On narrow phones the WhatsApp action uses its recognizable icon and accessible label to keep the bar in one row.
- Full product pages keep Add to cart (or the selected variant's quantity controls) and WhatsApp order side by side in a compact, single-row fixed bottom bar on desktop and mobile, including after adding an item. Page spacing keeps product content and the footer clear of the bar; phone safe-area padding is respected. Modal actions retain their existing scrollport-sticky layout.
- Full-page checkout calculates shipping when a new or saved delivery address is saved, without a separate cart pincode panel. The summary encourages shoppers below ₹500 in items after coupon discounts to add more for free delivery, and shows when the threshold is reached. Shipping fees do not count; unpriced items do not imply eligibility.
- Cart Price breakdown is expanded by default and can still be collapsed by the shopper.
- Signed-in customers can open a full-page My orders view from their header name icon or hamburger menu. Confirmed/processing/shipped orders sort first before pagination; delivered, cancelled and failed orders follow. Cancelled or expired unpaid orders can be hidden in a separate paginated Hidden orders view and restored without changing admin or payment records.
- Reorder copies available order variants into the customer's existing cart at current prices and minimum quantities. Deleted/unpublished variants, insufficient stock (including live payment reservations), unavailable prices and cart limits are reported explicitly. Successful and failed/cancelled/expired orders can be reordered; pending or under-review payments are blocked to avoid duplicate payment attempts. Reorder never pays automatically. Apply `20261011040000_customer_order_actions.sql` before deploying the frontend.
- Saved addresses are selectable in both delivery and review, including when only one is available. Choosing another address saves its pincode and recalculates shipping before review; live checkout requires a contact email.
- Cart additions and quantity updates validate variant inventory in the database, subtracting other carts' active payment reservations without double-counting the same cart's reservation. Cart and product-page quantity controls stop at displayed stock; previously saved excess quantities block checkout with a reduction message. Adding to a cart does not reserve stock, so payment preparation and settlement still recheck inventory. Deploy `20261014223500_check_cart_item_inventory.sql` before the frontend.
- Stock-limit rejections use a shared cream/mustard/cocoa notice with customer-facing available-quantity copy in the catalogue and cart. Other errors retain their original details and error styling.
- A variant with zero available quantity is shown as "Out of stock" even if its availability flag is enabled. A product stays available while at least one variant has stock; initial rendered pages follow the same rule.
- Unavailable product cards repeat "Out of stock" in a bold cocoa-outlined pill below the price beside Share, in addition to the photo badge. Sharing remains available.
- Active product offers have a prominent cocoa percentage badge on the card photo and a high-contrast discount pill beside the crossed-out regular price. Savings remain visible on cards, detail pages and carts.
- Product detail photos also show the percentage badge. Active offers highlight the selling price, crossed-out regular price and per-piece savings in a mustard-bordered offer panel, updating for the selected variant.
- The admin discount dropdown shows each product's currently applied percentage or "No discount". The offer panel previews each variant's post-discount profit/margin from saved price-discovery costs using the standard ₹100/hour labour and 2% payment fee + 18% fee GST assumptions. Missing costs are reported explicitly; extra coupons are excluded from the estimate.
- Search discount products by name or category above the dropdown. Search is case-insensitive, keeps the selected product available, and can be cleared to show all products again.
- The admin console is lazy-loaded only at `#admin` and excluded from PWA precaching, so public visits do not download the admin bundle in the background. Opening an uncached admin console requires a network connection; service worker activation removes previously precached admin bundles.
- Catalogue network failures show a themed connection notice with a retry action instead of technical fetch errors. Loaded products stay visible and existing online/focus refresh restores live data; other server errors remain explicit.
- Unavailable selected variants also show the outlined stock pill in the product detail purchase bar beside WhatsApp and Share, so full-page shoppers see availability without scrolling.
- Empty carts include a "Shop now" link to the homepage product section (`#products`).
- Admin Products → **Product discounts** applies/removes an automatic 1–90% offer to all variants of one product. The original price is retained and restored when removed; changing a percentage never compounds discounts. Cards, detail pages and carts show the current price, crossed-out regular price, percentage and saving per piece. Stored selling prices are updated atomically so all existing cart/checkout/reorder/price-filter paths use the same price; existing payment quotes are unchanged. Existing coupons still apply under their normal rules. Prices round to whole rupees (minimum ₹1). Offers stay active until removed; remove an offer before editing regular prices. Static pages and Merchant feed include the offer. Deploy `20261015024500_product_discounts.sql` before the frontend.
- Admin Manage products includes a separate **Reduce stock** action per variant under **Stock adjustment (not a sale)**. It subtracts a positive whole quantity without calling Record sale or writing sales/revenue records, preserves unavailable variants, and marks zero stock unavailable. Verified admin MFA is required; the database prevents negative stock and reductions below active live-payment reservations. Apply `20261015020000_reduce_variant_stock.sql` before deploying the frontend.
- Successful sign-in closes the account dialog without automatically showing My account, preserving the current shopping step. Signed-in customers can still open My account explicitly; password-reset dialogs keep their completion flow.
- Admin Settings → Manage categories supports seasonal categories such as Navaratri. Check Seasonal category when creating one, then Manage products to select existing products and show/hide the collection. Products retain their primary categories, stock and prices and can appear in multiple seasonal collections. Only published products are shown; empty seasonal collections stay out of shop navigation. Category saves trigger the existing rebuild for static collection pages and sitemap. Apply migration `20261011010000_add_seasonal_categories.sql` before deploying this feature.
- Generate discount coupons in Admin Settings is collapsible like Manage categories, initially closed; toggling preserves entered values and existing coupons.
- Overview generation tries the configured Gemini models, then Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for availability failures, missing models, rate limits or network timeouts. Category requests allow 12 seconds per Gemini model and 20 seconds per Cloudflare request. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with Workers AI permission to enable the independent backup; provider usage charges may apply. Authorization failures remain explicit. The browser does not restart the whole provider chain after failure, and existing drafts remain intact.
- Seasonal filter buttons and live collection labels use the existing slow mustard glow to draw attention without rapid flashing. Reduced-motion preferences disable the animation and retain a static highlight.
- Unselected seasonal category buttons have a solid mustard-gold fill; the selected category retains the cocoa fill and cream text so the active filter remains distinguishable.
- All ticker messages scroll at the same 50 CSS pixels per second, with each message completing a loop before rotating. Seasonal announcements use a plain underlined link without text glow. Hover pauses movement and message rotation; keyboard focus brings the link into view and pauses it. Reduced-motion preferences disable scrolling.
- Seasonal collections also use mustard-gold fill in the hamburger menu, including seasonal collections not selected for the ticker.
- Hamburger collection links always open dedicated collection pages with their overviews and products. Homepage category chips continue to filter the catalogue in place.
- Collection pages let shoppers browse products and use cart controls directly; no redundant "Shop collection with the cart" button redirects them back to homepage filters.
- Gemini category drafts must contain 60-90 words, naturally use relevant category/product keywords, highlight handmade crochet and invite shoppers to explore without keyword stuffing or invented claims. One retry is allowed for an out-of-range response before an explicit error. Manual overviews may be shorter but cannot exceed 90 words. Live/static pages and the admin editor cap older long overviews at 90 words without changing the stored original until an admin saves it.
- Visible seasonal categories always appear before regular categories (priority still orders categories within each group). In Manage products, select one seasonal category to feature in a clickable "Check out our [name] collection" store ticker. The link opens its collection page; hiding the category removes its announcement.
- Category overviews can be edited manually or drafted with **Generate overview with AI** from saved published product facts. Save product selection first, reopen Manage products (or Edit image & overview for a regular category), generate, review and save. Drafts are not published automatically; overviews appear on live and static collection pages. The category-overview mode uses Gemini with an independent Cloudflare fallback and server-side admin authorization. Only public product facts are sent to either provider. Both providers must satisfy the same 60-90-word validation. Cloudflare structured JSON responses and legacy JSON strings are both accepted. Apply `20261011013000_add_category_overviews_and_ticker.sql` and deploy `analyze-product`.
- Signed-in customers can sign out directly beneath My account in the navigation menu, with explicit success or error feedback.
- When the welcome offer is enabled, guest checkout shows a prominent signup banner on cart, delivery and review with the configured percentage, cap, minimum and validity. Create account opens signup without leaving the checkout step; guests can still continue without registering.
- Editing delivery details hides payment until review. Razorpay's official secure payment popup remains unchanged. Confirmation refresh uses an ownership-checked request ID (`checkoutRequest`), even after the purchased cart is cleared; a confirmation URL alone never confirms a payment or offers another payment.
- Signed-in live checkout syncs the latest owned payment request from the backend, including when browser recovery is absent or holds a rejected request from another-device checkout. Customers can resume the existing checkout and poll for webhook-confirmed payment. Changed cart snapshots and expired orders go through the existing provider-checked replacement flow; ambiguous payments remain blocked. Recovery lookup failures disable payment and offer an explicit status retry. Apply `20261014215500_sync_live_checkout_across_devices.sql` before deploying the frontend.
- Closing or failing a live payment highlights a recovery card with saved-cart reassurance, a Resume secure payment action and WhatsApp help. Failure details remain visible after closing the payment window. Resuming uses the existing server-checked checkout flow; payments awaiting verification offer verification instead of another payment, and customers who were debited are told to contact Luvia before paying again.
- Recoverable interruptions display a Payment incomplete badge, a handmade-favourites reminder and a contrasting mustard resume button. Completion encouragement is not shown for blocked payments, pending verification or confirmed orders.
- If the server blocks checkout because an earlier payment is pending, paid or needs review, a prominent support card replaces the payment button. The storefront does not claim it can resume an unavailable payment or bypass the duplicate-payment protection.
- The shared cream/cocoa footer remains at the bottom of product and checkout pages, with UPI, Visa, Mastercard, RuPay and Wallet followed by the Luvia Creations copyright.
- Admin products show all-time pieces sold from saved sales linked by product ID, across variants, dates and channels. Creating, editing, deleting or importing sales refreshes the counts; unlinked manual sales are excluded and stock is unchanged.
- Reddit variant links use dedicated static variant pages with matching preview images, titles and prices. Visitors open the selected variant in the interactive product view; existing query-based links remain supported. Reddit may retain cached previews on older posts.
- Mobile store pages use equal-width collection links and aligned ordering-policy links; About ordering disclosures are grouped in a readable panel.
- When Turnstile is configured, bot verification is prepared while browsing. A prepared token is consumed once within four minutes; missing/expired tokens still require the verification dialog before anonymous signup.
- Homepage, product views, Google feed landing pages, About and FAQ describe the primary online journey: cart, delivery address, total review and secure Razorpay payment. Orders are confirmed after payment verification; paid online orders need no separate WhatsApp confirmation. WhatsApp is for help, customisation and assisted ordering when checkout is unavailable. Public copy does not describe the admin sandbox. Shared dispatch/shipping guidance lives in `src/content/storeContent.json`; shipping is free at ₹500 in items after coupon discounts, otherwise the saved estimate rounded up to ₹10 or ₹100 fallback applies. Merchant Center eligibility is not guaranteed.
- Product purchase bars keep the labelled Add to cart action first and prominent, with a secondary Ask on WhatsApp action and the existing share button. Existing quantity controls, mobile sticky placement and variant-specific enquiry links are preserved. Free-shipping shortfall messages use the existing coupon-aware calculation in both checkout and the cart drawer, and never imply eligibility for unpriced items.
- "Collaborate with us" in the hamburger menu and footer links to a maker/brand invitation above the footer, with a prefilled collaboration WhatsApp enquiry using the existing contact number
- Dedicated order and WhatsApp contact: +91 9205907350
- Email contacts for orders and general enquiries
- Installable app experience on supported browsers. A dismissible install suggestion
  appears six seconds after the browser reports install eligibility, once per tab
  session. Not now keeps the manual Install App button available. Standalone apps
  and browsers without an install event do not show the offer; checkout, account,
  feedback, product-detail and admin pages do not automatically suggest installation.

## Razorpay payments

Customer-facing price disclosures state that prices are in Indian rupees and applicable shipping is shown before payment. They do not claim GST inclusion or exemption. Internal tax estimates are separate from storefront wording; confirm registration and tax obligations with a qualified adviser.

Public compliance URLs are `/terms-and-conditions/`, `/privacy-policy/` and `/return-policy/`. Terms and privacy content share `src/content/policies.json` between the live storefront and pre-rendered HTML, with footer links and sitemap entries. Use the dedicated URLs, not `/about/`, in provider compliance checks. Policy text must be reviewed against actual business practices and applicable requirements; publication does not guarantee provider approval.

### Standard Checkout webhooks (test mode)

The Razorpay test-payment tool has been removed from admin Settings.
Live customer checkout and existing payment verification/webhook handling are
unchanged. Sandbox infrastructure remains available for development testing;
this removal does not delete historical test payments.

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
existing enquiry flow remains available. Admin Settings does not expose a
test-payment tool.
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
cancelled or expired, unpaid live entries; this hides them without deleting the payment
ledger or customer history. A subsequent status change, including a late
capture requiring review, makes the entry visible again.
After verified payment, checkout displays a prominent order-success panel with
payment confirmation, the order reference and separate email-delivery guidance.
The panel does not claim that the email has reached the customer's inbox.
For paid live orders, Admin → Orders → Show details includes fulfilment controls:
Confirmed → Processing → Shipped → Delivered. Progress cannot move backwards.
Courier name, tracking number and a public HTTPS tracking link are optional for
shipped/delivered orders. Updates appear in the customer order dashboard after
refresh; they do not modify payment status or perform refunds.
Changing to Shipped or Delivered queues a branded customer email using the
existing order email worker. Tracking-only edits and repeated status saves do
not resend it. Concurrent status changes require refreshing before saving.
Order emails use Luvia's cream/cocoa/mustard theme with item images and product
links from the saved purchase snapshot, a payment summary, delivery details and
dispatch/support guidance. Email clients may require enabling remote images.
Public business-location copy uses Gurugram, Haryana, India; saved customer
addresses are not rewritten. The footer shows locally hosted UPI, Visa, Mastercard and RuPay
marks with Razorpay checkout-availability guidance, not a guarantee of every
payment option. Visa artwork is from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/visa.svg)
(CC0); the Mastercard symbol is from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mastercard-logo.svg).
These marks belong to their respective owners.
UPI and RuPay artwork is from Wikimedia Commons ([UPI](https://commons.wikimedia.org/wiki/File:UPI_logo.svg),
[RuPay](https://commons.wikimedia.org/wiki/File:RuPay.svg)).
The live footer uses a compact, wrapping "We accept" logo strip, plus a generic
Wallet icon (without implying support for a particular wallet provider), on the cocoa
background rather than individual payment cards.
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
Migration `20261011180000_order_fulfilment_emails.sql` adds customer-only Shipped
and Delivered events to the existing private `order_confirmation_emails` queue.
Deploy the updated `order-confirmation-worker` before applying the migration.
No new provider secrets or cron job are required. Events are unique per order,
audience and kind; shipment details are snapshotted on the status transition so
later tracking edits do not rewrite pending mail. Shipped emails include optional
courier/tracking details and a safe HTTPS tracking button; Delivered emails explain
that the order was marked delivered and offer help if the parcel has not arrived.
Both reuse the cream/cocoa/mustard theme, product photos, order reference and
support/policy links. Existing retries/acceptance monitoring apply to all kinds;
admin confirms queueing, not inbox delivery. Only future status transitions queue
these emails; historical shipped/delivered orders are not backfilled.
Automatic courier-status synchronization is not enabled. Automatic WhatsApp messages require
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
npx tsc -b
npm test
npm run test:e2e   # deploy gate: stable release-path browser checks
npm run test:e2e:full   # broader browser suite while older specs are refreshed
npm run build
```

`npm run test:all` runs lint, unit tests, browser tests and the build together.
`npm run test:smoke` runs the read-only live checks in `e2e-smoke/`.

Every deployment is gated by the same checks (see [Deployment](#deployment)).
If a change intentionally alters the storefront, update the matching release
test in `e2e/release.spec.ts` (and any broader `e2e/` specs you touched) in the
same commit; a failing gate blocks the deploy and the live site keeps serving
the last good build.

`playwright.smoke.config.ts` runs read-only checks (`e2e-smoke/`) against the
live site: `npm run test:smoke`. Set
`SMOKE_BASE_URL` to check another deployment. These tests must never add to the
cart, submit forms or sign in.

## Product images

For Reddit image posts, open a product's Share menu and choose Reddit. The
gallery stops auto-rotating when sharing opens, keeping the selected photo,
variant and Reddit helper feedback stable even after sharing is closed. Manual
photo/variant changes remain available.
The photo-post helper prepares the selected photo (converting WebP to JPEG for
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

**Settings -> Admin users** lets the owner invite new admins, grant access to
existing verified email accounts, edit display names, change admin passwords
and remove access without deleting accounts or historical records. Regular
admins can only change their own password. Every change requires the caller's
current password and the existing Turnstile verification. Login email is not
edited in place: add the new verified account, then remove old access.
The owner cannot be removed or transferred from this screen.
The storefront greeting uses the latest saved account name (first name), then
the delivery-profile name, then the email prefix. Name edits refresh the current
greeting immediately; returning to another open shop tab refreshes it on focus.

Customers can open **My account -> Change password** to enter their current
password, a new password and confirmation. The new password must differ from
the current one and meet the existing 8–72-character, letter-and-number rule.
An isolated CAPTCHA-protected sign-in verifies the current password without
replacing the active session or disrupting carts/addresses. Password fields
are cleared after submission or cancellation; failures are shown inline.
Each password field has its own Show password checkbox, hidden by default.
My account also displays the signed-in email. Admin account-management forms
offer independent reveal controls for current/new/confirmation passwords and
reset visibility when cleared or cancelled.

**Customers -> Temporarily disable account** lets an admin suspend a registered
customer after a fraud report, or re-enable them after identity verification.
Both actions require an internal reason and the caller's current admin password
with CAPTCHA. Suspension is manual (implemented as a 100-year Auth ban), not
account deletion; account data and orders are preserved. All admin accounts are
protected from this customer-management flow. Restore access before helping a
suspended customer complete password recovery.

Migration `20261012070000_customer_account_suspension.sql` installs a database API
pre-request check, rejecting even already-issued JWTs for banned accounts.
It refuses to overwrite an existing pre-request hook. Service-role checkout and
coupon entry points check the caller's account/JWT status before privileged work;
the ban trigger revokes sessions and refresh tokens, so restoring an account
does not revive previously compromised sessions. Payment webhooks still
settle legitimate captured payments. `customer_account_audit` keeps private
actor/target/action/reason history. Deploy the migration before the updated
`manage-admin-users`, `create-order`, `verify-payment`, `create-live-order`,
`verify-live-payment` and `welcome-coupon` functions.

**Forgot password** on the storefront and admin login opens a dedicated
email-only form. No current password is requested. The emailed recovery link
then lets the recipient choose and confirm a new password; authenticated
Change password and privileged admin changes still require authorization.

**Admin authenticator protection:** Microsoft Authenticator or another TOTP app
is required, with renewed verification every 15 minutes. Complete setup at
admin sign-in using a trusted login. Product/ticker change history supports
investigation. Deployment, emergency response and recovery procedures are
maintained in the private operations repository.

**Share feedback** is available in the footer and signed-in My account.
The footer groups brand information, store links and contact details into
responsive columns on desktop. Below 768px, Contact us and Share feedback remain
visible in a compact footer, with store, return-policy and contact links inside
a keyboard-accessible Help & information disclosure. Repeated branding is hidden
on mobile; a slim UPI/Visa/Mastercard/RuPay logo row and checkout-availability
guidance remain visible above copyright. Desktop keeps the full-size payment
strip including Wallet. Checkout payment options are unchanged.
Desktop always shows the full footer, even after collapsing the mobile
disclosure. Its compact feedback link and the My account link open the
dedicated `/?page=feedback` page, with a bounded form and a Back to shop link.
No inline feedback panel expands inside the footer or account dialog.
Customer My orders cards show one prominent order-status panel (Confirmed,
Processing, Shipped or Delivered), without a separate Payment received badge or
paid-date line. Unpaid/review states remain visible; admin payment labels are
unchanged for reconciliation.
Messages are required (10–3,000 characters); category/name are optional.
Email is collected only when "I'd like a reply" is selected. Account contact
details are never attached automatically. No phone/address is requested.
Submissions are private feedback, not public or verified purchase reviews.

Deploy `feedback-worker` before migration `20261012060000_store_feedback.sql`.
`submit_store_feedback` uses an existing Auth session or a CAPTCHA-protected
guest session, allows three submissions/session/hour and 100 total/day, and
deduplicates unchanged retries by request UUID. Browser roles cannot read the
private queue. Session IDs support rate limiting; rows expire after 90 days.
Delivered emails have separate mailbox retention.

The existing worker secret/Resend key deliver to `feedback@luviacreations.com`
from `Luvia Creations <hello@luviacreations.com>`. Reply-To is the supplied email
only when a reply was requested, otherwise the feedback mailbox. No automated
customer acknowledgement or marketing subscription is sent. The minute cron
claims five jobs with eight attempts, 15-minute leases and stable idempotency.
Migration `20261012080000_feedback_delivery_confirmation.sql` dispatches new
submissions immediately, keeps the minute cron as a fallback, and allows 90
seconds for a five-email worker batch. The owner-only
`store_feedback_delivery_status` RPC exposes only sent/pending/failed, never
feedback content or provider errors. The form waits up to 20 checks before
showing "sent to"; it requires recorded provider acceptance. Failed or delayed
confirmation keeps the message and request ID for a deduplicated retry and
explicitly explains that feedback was saved but sending is not confirmed.
Provider acceptance does not prove inbox delivery. Monitor feedback mailbox
forwarding and failed jobs; order/payment enquiries remain at
`orders@luviacreations.com`.

**Password-change security emails** cover both admins and normal customers,
including successful password resets. Migration
`20261012050000_password_change_emails.sql` queues a private notification when a
verified non-guest account's password changes; names, sign-ins, unchanged
password fields and unverified signup drafts do not queue messages.
Deploy `password-change-worker` before applying the migration. The minute cron
uses the existing worker secret and Resend API key, sending from
`Luvia Creations <hello@luviacreations.com>`. Failed messages
retry up to eight attempts with 15-minute leases and a stable provider
idempotency key. `accepted_at` means provider acceptance, not inbox delivery.

The cream/cocoa/mustard template in
`supabase/functions/_shared/passwordChangeEmail.ts` includes the Luvia logo,
account email and change time, and tells recipients to reply immediately if
they did not request the change. Reply-To is `hello@luviacreations.com`; monitor
that mailbox. No password, hash or reset token is stored in the notification
queue or included in the email. Supabase's native password-change notice stays
disabled to avoid duplicate messages; this backend queue also covers admin-set
passwords. Existing password changes are not backfilled.

Deploy migration `20261012040000_admin_user_management.sql` and Edge Function
`manage-admin-users` before the frontend. The migration promotes the single
existing admin to owner; ambiguous or empty admin lists abort instead of
guessing ownership. Only the service-role backend can change membership or
read the private audit trail. Passwords are not recorded in that trail.
New-account invitations use Supabase Auth's configured invite template/SMTP,
not the Resend order queue. Invitation links open the password-setting dialog;
after setting a password, open `/#admin` to enter the console. Existing accounts
retain their credentials and name. Pending invitations can be removed; an
expired invitation can use the existing Forgot password flow to regain access.
Provider acceptance is not a guarantee of inbox delivery.

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
The image host deliberately has no sitemap of its own: product photos are
listed as `<image:image>` entries (960 px copies) under each product page in the
main `https://luviacreations.com/sitemap.xml`, which Google accepts for images
served from another host.

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
Archive errors surface the Edge Function's error detail while keeping publication
blocked. If private archival fails, verify that the server's `R2_ACCESS_KEY_ID`
and `R2_SECRET_ACCESS_KEY` are a matching pair with access to both buckets.
Rotate/update them together; changing only the key ID breaks signed R2 requests.
Do not disable archival or make the originals bucket public to bypass a failure.

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
The mobile footer keeps Contact us and Share feedback visible, groups secondary
navigation and contact actions in Help & information, and keeps 44px tap targets.
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
and checks the PIN using Shiprocket's public
`GET /v1/external/open/postcode/details?postcode={pin}` endpoint.
The returned city/state is area metadata, not address verification or guaranteed
courier serviceability. City names are stored separately from district names.
Old postal-provider cache entries are refreshed through Shiprocket on the next
lookup; only Shiprocket-derived entries are reused for 30 days.
Only the PIN is sent upstream; no cart IDs, user IDs, IP addresses or GPS are sent.
Confirmed postal areas are cached for 30 days. If the lookup has no record, the
format-valid PIN is saved without an area and shoppers are asked to double-check
it; Luvia confirms delivery availability before fulfilment. Lookup outages still
produce explicit errors and never overwrite saved data. Lookups are limited to
one per active cart every 10 seconds and have an 8-second upstream timeout.
Saved PINs are included in WhatsApp/email enquiries and shown in admin as
shopper-provided; checked PINs also show city/state (or legacy district), country and the
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

### Generated coupon usage and archival

Generated discount coupons in admin Settings show completed usage separately from
unexpired payment reservations. The Used status appears when paid orders or
confirmed offline redemptions reach the total usage limit; reusable coupons show
partial usage while capacity remains. Test checkouts do not count. Paid payments
awaiting manual order review also consume usage. Refresh coupons to load the latest
counts. Current and Archived views each show the latest 50 codes.
Archive disables new uses and hides the code from the current list without deleting
order/redemption history or changing already-issued payment links. Restore returns
the code to the current list but keeps it disabled; usage limits and expiry remain.
Migration `20261011170000_campaign_coupon_archive.sql` must be applied before deploying
this UI. Its admin-only RPCs expose no customer details. Welcome/signup coupons
remain managed by the existing welcome-offer and customer workflows.

### Private cart network metadata

Nonempty online carts record the gateway-reported network IP once through the
authenticated `capture-cart-network` function without delaying cart actions.
The endpoint checks cart ownership, expiry, items and admin session blocks;
it accepts no client-supplied IP body field. Network metadata is not a verified
location or identity, and is never used for access decisions. GeoLite2 city lookup
is disabled: the deployed function captures IP only and never downloads the
location database. This prevents repeated large Supabase Storage transfers on
function cold starts. No IP is sent to MaxMind or another geolocation provider.
Only admins can read `cart_network_details`; other shoppers
cannot read or write it. Admin carts show the captured network IP and any
historical approximate location. Missing metadata displays "Network IP: Not
recorded"; IPv6 addresses wrap without horizontal overflow. Capture dates remain
stored but are not displayed. The IP is not a verified identity or location.
Access expires 30 days after capture; an hourly pg_cron job purges expired
metadata, and cart deletion cascades immediately. No new shopper-facing notice
or popup was added. Apply `20261010032000_add_private_cart_network.sql` and deploy
`capture-cart-network` before deploying the frontend.
Run `npx supabase db query --linked --file supabase/tests/cart-network.sql`
to verify admin-only reads, denied shopper writes, expiry and the cleanup job;
all fixtures are rolled back.

Existing approximate locations are retained until normal metadata expiry; new
carts show "Unavailable" in admin. The private `geolocation-private` bucket and
`GeoLite2-City.mmdb` are not deleted or made public. The location schema and
reader remain for historical compatibility, but are not used by the deployed
capture endpoint. Re-enabling lookup requires an explicit implementation change
with a bandwidth-safe database source; uploading a file alone does not enable it.

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

### Automatic online sales

When a website checkout is paid, each order line is added to the sales dashboard
as an **Online** sale automatically (migration
`20261016031000_record_paid_online_orders_as_sales.sql`). Each line records:

- the price actually paid, with any coupon discount split across lines by value;
- the product's saved GST, material, packaging and labour (₹100/hour) costs;
- the saved shipping cost on one line per order, since the order ships once;
- a 2% payment fee with 18% GST on the fee;
- the paid date in IST, and a note with the order reference and shipping charged.

Each line is recorded once, so repeat updates don't create duplicates. Test
checkouts, unpaid/expired orders and older payment-link orders are not recorded.
Recording never blocks payment confirmation; a failure is logged as a database
warning. Automatic sales count towards homepage bestsellers and can be edited or
deleted like manual entries. Orders paid before this change were not added
automatically; enter them manually if they are missing.

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
sales profit, material cost, labour cost, packaging cost, shipping cost, overheads, profit after
expenses, and the margin after overheads. Material/labour/packaging totals multiply saved
per-piece costs by quantity; shipping is counted once per sale. These cost
breakdowns are already included in profit deductions, not subtracted again.
Sales profit and profit after business expenses lead each card in larger summary
panels, with margins before and after business expenses beside the respective
figures. Negative profit is highlighted as a loss. Revenue and cost details sit
below in a compact responsive grid. Both margins use aggregate revenue before GST.
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

Signed-in My account shows saved address details and address management, plus a
My orders link to the separate full-page history. Orders are not embedded in the
account dialog. Sign out remains in the header account menu; password recovery
remains available from the sign-in form.
The homepage ordering and delivery guide is collapsed by default; its native
disclosure supports tapping, Enter and Space without removing help content.

GA4 and the Meta Pixel are loaded for the public catalogue only; the `#admin`
console is never tracked.

Internal visits can be excluded from the reports by opening the site once with
`?traffic=internal` in each browser.

The public customer journey tracks:

- Initial and in-app `page_view` / Meta `PageView` without duplicate URL-only
  replacements. GA page URLs exclude auth tokens, payment request IDs and unknown
  query parameters. Disable **Page changes based on browser history events** in
  the GA4 web stream's Enhanced Measurement page-view settings; the application
  now sends those views itself. Leave initial automatic views disabled via the
  application's `send_page_view: false` configuration.
- One `view_item` / `ViewContent` per product opening, not per automatic gallery
  rotation. Explicit variant selection, zoom, share and enquiry events remain.
- Confirmed cart mutations: `add_to_cart` (including reorder/increases) and
  `remove_from_cart` (including decreases/clear). Quantities are actual saved
  deltas; GA and Meta values multiply unit prices by those quantities. Unknown
  prices omit value rather than reporting zero.
- `view_cart`, `begin_checkout`, `add_shipping_info` after saved address
  submission/selection, and `add_payment_info` when live Razorpay checkout opens.
  Meta receives `InitiateCheckout` and `AddPaymentInfo`. Payment failure and
  window-close, opening-error and verification-pending events never imply a
  purchase. WhatsApp/email cart handoffs remain enquiry events, not orders.
- `signup_started` for accepted registration requests, `sign_up` after email
  verification (code or activation link), password `login`, `logout`,
  `view_orders`, successful `reorder`, `hide_order` and `restore_order`.

Migration `20261011050000_purchase_analytics.sql` exposes only an owned, paid,
live, non-test order's product/quantity/amount snapshot. `purchase` / Meta
`Purchase` use this server snapshot, including on webhook recovery or confirmation
refresh after cart deletion. GA value is merchandise revenue after discount,
excluding shipping; Meta value is the actual paid total including shipping.
Order-level discounts are allocated proportionally to item prices so GA item
revenue agrees with the paid merchandise value.
Purchase events use the stable order reference, with per-provider persistent
browser deduplication and a stable Meta event ID. Analytics failures are logged
without blocking payment confirmation; if storage is unavailable, reload
deduplication cannot be guaranteed. Browser blockers, cleared storage or another
device can still affect delivery/deduplication; this is not server-side CAPI.

Customer names, emails, phone numbers, delivery addresses, payment signatures and
auth identifiers are not included in the new event parameters. Admin and
automated visits are suppressed; Meta also suppresses internal visits. GA internal
traffic remains tagged for its existing internal-traffic filter. Dashboard setup
should mark `purchase` as a GA4 key event and verify receipt in GA DebugView /
Meta Test Events; unit/browser tests verify queued payloads, not dashboard receipt.
Meta automatic event configuration is disabled, and the pixel waits until auth
tokens are removed from activation/recovery URLs. Keep automatic advanced
matching disabled in Meta and automatic form-interaction measurement disabled in
GA4; customer contact fields are not marketing consent.

## Deployment

The public catalogue is deployed with GitHub Pages at:

https://luviacreations.com/

The previous GitHub Pages URL redirects to the custom domain:

https://singhalgoru.github.io/croche-catalogue/

The build fetches published products from Supabase and generates a crawlable
`/p/<product>/` page and sitemap entry for each one. The deploy workflow runs on
every push to `main`, about a minute after any catalogue change in admin (via a
database trigger), and daily at 01:23 UTC as a safety net.

Each run first verifies the code: lint, type checks, unit tests and the
release-path Playwright suite on desktop and mobile Chromium
(`e2e/release.spec.ts`). Nothing is deployed unless all of them pass. A passing
commit is remembered (an Actions cache entry keyed by the commit), so
catalogue-change and scheduled rebuilds of already-verified code skip straight
to the build. After deploying, the `smoke` job waits until the live site serves
the new entry script, then runs the read-only live smoke tests on desktop and
mobile. A failed run uploads the Playwright report as an artifact and GitHub
emails the repository owner. The broader `npm run test:e2e:full` suite remains
available for refreshing older specs without slowing routine deployments.
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
Static product content includes navigation, a skip link and up to six existing
product/variant/gallery photos, with an eager WebP hero and lazy supplementary
photos. JPEG `og.jpg` remains the social preview. The no-JavaScript fallback
explicitly offers assisted ordering, not a non-functional Add to cart button.
Search/social product titles match the concise interactive product title, and
the homepage uses a complete, fixed description rather than a truncated list
of categories.
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
to its crawlable `/collections/<category>/` page, with the product marked as the current page.
Static pages and BreadcrumbList schema use the same category destination.
Homepage category chips still filter in place. Legacy UUID URLs remain canonical
aliases: GitHub Pages cannot configure custom HTTP 301 redirects. Converting
them requires a separately authorised edge/domain redirect configuration; do
not replace an HTTP redirect with JavaScript or remove working legacy links.
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
