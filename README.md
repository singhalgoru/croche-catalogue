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
