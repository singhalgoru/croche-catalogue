# Luvia Crochet Catalogue

A mobile-friendly catalogue for [Luvia Creations](https://luviacreations.com),
an India-based handmade crochet brand.

## Features

- Browse products and collections, search the catalogue, and filter by price.
- The homepage uses compact brand copy on mobile, retaining the full introduction
  on desktop and in crawler-visible HTML.
  Premium handmade crochet gifts and accessories lead the homepage messaging,
  with direct actions to shop the collection or explore gift ideas.
- Open `/search/` from the desktop header icon or mobile sticky search bar and share keyword searches using
  `?q=...`. Results update as you type; press Enter to save the search URL. Search matches names,
  categories, descriptions, materials and variants;
  multiple keywords can appear in any order.
- Tapping mobile search opens a focused screen with a top search field, back
  arrow and automatic input focus. The mobile header and bottom bar stay hidden
  on this screen; clearing a query keeps focus for the next search.
- Search remembers the latest eight submitted keywords in this browser only,
  without an account or cross-device syncing. Tap a recent keyword to reuse it,
  remove individual entries, or clear the history.
- Discover bestsellers and featured products in homepage carousels and on
  dedicated, crawlable pages at `/bestsellers/` and `/featured/`.
- Discover the latest available piece and discuss a customisation idea from the homepage.
- Use the crawlable `/crochet-gift-guide/` for gift-selection advice, suitability
  checks, customisation questions and delivery planning.
- Customer Love presents selected, permission-based customer stories on the
  homepage, matching product pages and `/customer-love/`. Administrators manage
  private drafts, photos, multiple product tags and publication consent. Long
  card previews link to the full story. These are testimonials, not
  star ratings or verified-purchase claims.
  An optional on-device English text reader helps prepare quotes from review
  images; administrators review the extracted text before applying it.
  Published stories are listed automatically in `sitemap.xml` and `llms.txt`.
- Site photos and videos block casual right-click saving and dragging.
- Meet the founder in the homepage story card above collections, with a link to
  the full About page, where her LinkedIn profile is available. Both use a cropped, optimised founder portrait.
  Empty-cart “Shop now” opens the product-grid heading.
- View product details, available variants, angle photos, image zoom and optional
  making videos. Tap the top-right play badge on a product image to jump to its
  making video and start muted playback (subject to browser autoplay settings).
- Save a cart, check delivery availability, place orders and view order history.
- Customer delivery emails include an optional link to share honest feedback
  on Luvia Creations' Trustpilot profile.
- Request account and associated-data deletion at `/account-deletion/`, also
  linked from signed-in account details. The Privacy Policy covers the shop
  and its Android app.
- Use the header for search, cart and navigation; sign in, account details and
  order history are available inside the navigation menu.
- Signed-in customers see an initial badge on the menu button; their name and
  account actions stay inside the menu without adding another header row.
- On phones, larger centred branding sits above sticky search, and a fixed
  bottom bar offers Home, Collections, Cart, Account and More;
  the Account icon shows the signed-in initial and opens account details with a
  loading state rather than briefly showing sign-in controls. More includes store information,
  contact and policies. Navigation respects safe areas and hides behind dialogs
  and while the on-screen keyboard is open. The bar stays fixed on the cart;
  delivery, review and confirmation stay focused without it.
- On phones, checkout's primary actions stay fixed at the bottom, above cart
  navigation when present, from delivery details through secure payment.
  The running total is also shown at the top of cart and checkout steps;
  shipping remains estimated until an address is saved.
  Header cart icons never float on mobile: the bottom bar provides cart access
  while shopping, and only the primary checkout action stays fixed in checkout.
  Mobile checkout hides the desktop hamburger and header cart controls.
  The homepage keeps its large centred logo; other pages use compact,
  left-aligned branding on mobile.
  Compact logos include the Luvia Creations name. Collection pages keep compact
  mobile branding and bottom navigation even before the interactive app loads.
  Payment or assisted-order actions appear at review, after checkout settings
  load; a settings failure is shown explicitly rather than switching flows.
- Mobile catalogue filters open from an icon beside sticky search. Seasonal
  collections stay in collection navigation and the filter panel; active-filter
  chips scroll with the product grid rather than occupying another sticky row.
- Contact Luvia by WhatsApp or email for product and customisation enquiries.
- Request an international quote at `/international-quote/` with product
  quantities and destination details, then review and send it by email or
  WhatsApp. Online checkout remains India-only.
- Install the catalogue as a home-screen app on supported browsers.
- An Android app for the shop is in development; it is not yet available on
  Google Play.
- Authorised administrators can manage products, drafts, media and orders.
  New products receive a unique, permanent SKU automatically when first published.
  The site owner can update the public WhatsApp contact number and GA4/Meta
  tracking IDs in collapsible Admin Settings; other admins have read-only access.
  Payment credentials and other server-side secrets remain
  deployment-managed.
  The product-post modal also supports manual WhatsApp group sharing with an
  editable WhatsApp-formatted caption, emoji picker, photo preview and copy/download fallbacks. Select the group
  and send inside WhatsApp; native photo sharing requires browser/device support.
  Pinterest preparation offers a branded vertical image, editable title/description
  and copyable product link. Choose a branded poster or photo-first layout with a
  larger original photo; both resize locally to 1000 x 1500 without AI, cropping
  or stretching. Download and publish manually in Pinterest; this
  website does not select boards, publish pins or verify their publication.
  Facebook/Instagram posts can include up to 10 selected, ordered product photos:
  an Instagram carousel or a Facebook multi-photo post. If a product has a
  published making video, administrators can prepare and review it for Facebook
  video or Instagram Reels before explicitly publishing it. Instagram also
  supports one carousel with up to nine photos followed by the making video;
  Facebook offers photos or video separately.
  Categories can be hidden from collection navigation without deleting their products.
  Price discovery and sale recording support calculated labour costs and hourly-rate overrides.
  Product pricing estimates include configurable marketing, returns and overhead reserves,
  with a default 20% target profit margin; recorded sales and expenses stay separate.
  Business expenses support automatic recurring schedules with configurable frequency and pause/resume.
- The admin Marketing workspace can show read-only Meta delivery data, reconnect
  Meta, and create AI campaign proposals with model provenance and location
  planning for internal review. When configured, a separate confirmation creates
  paused Facebook Feed, Instagram Feed, or combined Facebook + Instagram Feed
  image ads from approved proposals. Combined Feeds use one shared lifetime
  budget. Instagram requires a verified Page-linked identity and ad-account access.
  Activation remains manual in Meta Ads Manager. Eligible incomplete attempts offer a separate saved-details
  recovery review without recreating the campaign or ad set.
- Published products have a **Create social post** dialog with Facebook / Instagram
  publishing, plus manual WhatsApp and Pinterest preparation. Meta posts have editable
  captions, JPEG previews, explicit live-publish confirmation and per-platform
  results. Organic posting requires configured publishing permissions and a
  Page-linked professional Instagram account. Saving a product never posts or
  boosts it automatically. Instagram video posts require a making video of at
  least three seconds. New posts preserve published history. A replacement draft
  creates a new post after review; remove the original manually in Meta after
  checking the replacement. Existing likes and comments do not transfer.
- The site builds a public Meta Commerce product feed from eligible published
  products at `/meta-catalog-feed.xml`; an administrator can connect its URL as
  a scheduled feed in Commerce Manager. Catalog creation and Meta permissions
  remain separate setup steps.
- Invited artisans can submit a private application; authorised administrators
  can send invitations and review applications in the Artisans workspace.
  The application supports English and Hindi; answers remain in their original language.
  A delivery address is required for new applications.
  Invitations expire after 24 hours or one submission. Applications include
  material-dispatch terms and an optional, consented masked-ID photo.
  Photo preparation runs on-device, including a fallback for browsers without
  native WebP encoding.
  After submitting, artisans can optionally share a short work video on WhatsApp.
  Private working profiles include skill/rating filters, comments and payment
  records, with onboarding details and separately consented profile photos.
  Applicants receive review updates by email, and the form and emails explain
  the application-to-paid-trial process.
  Product-level artisan patterns support Luvia-branded English/Hindi authoring,
  private editable Word masters and print-restricted PDFs (up to 2 MB each),
  with centred branding, a copyright notice, product link and main photo.
  Pattern IDs start with the product name and are generated automatically;
  the preparer is always Luvia Creations.
  Only the reviewed PDF is emailed, after explicit confirmation, to Approved
  artisans with an application email. PDF restrictions are reader-enforced,
  not a guarantee against redistribution.

## Ordering

Product availability and pricing may vary by variant. Check the current product
page and checkout for available options and delivery details. Orders ship within
India; customisation and dispatch timing should be confirmed with Luvia.

Read the [ordering FAQ](https://luviacreations.com/faq/) and
[return and refund policy](https://luviacreations.com/return-policy/) before
ordering.

## Ownership

Copyright 2026 Luvia. All rights reserved. This repository is public for
transparency, but its code, brand assets, catalogue content and product photography
are not licensed for reuse. See [LICENSE](./LICENSE).
