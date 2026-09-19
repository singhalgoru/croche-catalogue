import type { Product } from '../types/product';

// Real Luvia product photos live in `public/images`. Filenames are the
// original WhatsApp export names, so we URL-encode each path segment
// (but keep any `/` separators intact) for use as <img src>. `BASE_URL`
// picks up Vite's configured base path (e.g. `/croche-catalogue/` on
// GitHub Pages) so images resolve correctly wherever the site is hosted.
const img = (filename: string) =>
  `${import.meta.env.BASE_URL}images/${filename.split('/').map(encodeURIComponent).join('/')}`;

// Real catalogue data for Luvia — handmade crochet accessories & decor.
// Prices are estimates in INR; update them to match your actual pricing.
export const products: Product[] = [
  {
    id: 'p1',
    name: 'Rainbow Braid Ponytail Wrap',
    category: 'Hair Accessories',
    price: 349,
    description:
      'A vibrant multi-strand braided yarn tassel that ties onto any hair elastic — wear it with a ponytail, bun, half-tie, or braid for an instant pop of colour. Colours can be customised.',
    color: '#2fae8f',
    inStock: true,
    image: img('WhatsApp Image 2026-07-19 at 16.22.01.jpeg'),
  },
  {
    id: 'p2',
    name: 'Kids Rakhi Collection',
    category: 'Rakhi',
    price: 149,
    description:
      'Sweet crochet motif rakhis made for kids — choose from a pink elephant, a cheerful blue-faced critter, a sunny lion, a soft flower, or a bold sporty web-pattern design, each finished on a soft braided cord with pearl accents. Sold individually — pick your favourite motif.',
    color: '#e08fae',
    inStock: true,
    image: img('WhatsApp Image 2026-07-22 at 12.31.51.jpeg'),
  },
  {
    id: 'p3',
    name: 'Mini Bow Hair Clips (Set of 4)',
    category: 'Hair Accessories',
    price: 299,
    description:
      'Dainty crochet bow clips in lavender, sky blue, lilac, and ivory — a sweet everyday set for little ones, gentle on fine hair and easy to clip in and out.',
    color: '#b9a6d9',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.30 (2).jpeg'),
  },
  {
    id: 'p4',
    name: 'Mustard Scalloped Headband',
    category: 'Hair Accessories',
    price: 349,
    description:
      'A soft scalloped crochet headband finished with delicate bow-tie ends, perfect for everyday wear or a warm pop of colour on special days.',
    color: '#d9a441',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.29.jpeg'),
  },
  {
    id: 'p5',
    name: 'Bridal Rose Tassel Hair Clip',
    category: 'Hair Accessories',
    price: 599,
    description:
      'A rich maroon crochet rose paired with soft ivory tassels, styled to trail elegantly from a half-tie, open hair, or bun — a favourite for weddings and festive occasions.',
    color: '#8c1f2b',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.31.jpeg'),
  },
  {
    id: 'p6',
    name: 'Statement Red Rose Bun Clip',
    category: 'Hair Accessories',
    price: 449,
    description:
      'A bold red crochet rose with layered petals, designed to sit beautifully in a bun or updo — an easy way to dress up festive and traditional looks.',
    color: '#c8202f',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.29 (2).jpeg'),
  },
  {
    id: 'p7',
    name: 'Mogra Gajra Bun Accessory',
    category: 'Hair Accessories',
    price: 549,
    description:
      'A crochet take on the classic jasmine gajra — a lush trail of white blooms on a green vine, designed to wrap gracefully around a bun for weddings and traditional occasions.',
    color: '#f5f2e9',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.30.jpeg'),
  },
  {
    id: 'p8',
    name: 'Ivory Rose Trail Bun Pin',
    category: 'Hair Accessories',
    price: 599,
    description:
      'A row of hand-crocheted ivory roses that curves neatly around a bun for an elegant, bridal-ready finish.',
    color: '#f3efe4',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.31 (1).jpeg'),
  },
  {
    id: 'p9',
    name: 'Ivory & Maroon Rose Trail Bun Pin',
    category: 'Hair Accessories',
    price: 629,
    description:
      'The same elegant rose trail bun pin with a single maroon rose accent breaking up the ivory blooms — a subtle statement for weddings and festive wear.',
    color: '#8c1f2b',
    inStock: true,
    image: img('WhatsApp Image 2026-07-27 at 08.57.31 (2).jpeg'),
  },
  {
    id: 'p10',
    name: 'Flower Rakhi Duo',
    category: 'Rakhi',
    price: 199,
    description:
      'Delicate crochet flower rakhis in white and pink, each finished with a bead centre and soft braided ties — sold as a coordinating pair.',
    color: '#7fb88a',
    inStock: true,
    image: img('WhatsApp Image 2026-08-03 at 17.06.43.jpeg'),
  },
  {
    id: 'p11',
    name: 'Tricolour Bow Hair Clip',
    category: 'Hair Accessories',
    price: 249,
    description:
      'A saffron-white-green crochet bow clip with a navy centre, made to celebrate the tricolour in style — a cheerful accessory for Independence and Republic Day.',
    color: '#ff9933',
    inStock: true,
    image: img('WhatsApp Image 2026-08-04 at 14.13.34.jpeg'),
  },
  {
    id: 'p12',
    name: 'Tricolour Flag Brooch',
    category: 'Brooches',
    price: 199,
    description:
      'A neat crochet tricolour brooch with a navy centre button, designed to pin onto a kurta or shirt for a patriotic touch.',
    color: '#128807',
    inStock: true,
    image: img('WhatsApp Image 2026-08-13 at 19.45.01.jpeg'),
  },
  {
    id: 'p13',
    name: 'Tricolour Flower Scrunchie',
    category: 'Hair Accessories',
    price: 299,
    description:
      'A ruffled saffron-white-green scrunchie crocheted in a layered flower pattern — a festive twist on an everyday favourite.',
    color: '#ff9933',
    inStock: true,
    image: img('WhatsApp Image 2026-08-11 at 11.49.58 (1).jpeg'),
  },
  {
    id: 'p14',
    name: 'Rose Rangoli Pooja Mat',
    category: 'Festive Decor',
    price: 499,
    description:
      'A round crochet mat bordered with red rose blooms and a leafy trim — a reusable, handmade alternative to flower rangoli for your pooja space or festive table.',
    color: '#b2372f',
    inStock: true,
    image: img('WhatsApp Image 2026-09-06 at 18.23.21.jpeg'),
  },
  {
    id: 'p15',
    name: 'Mini Rose Bouquet Decor',
    category: 'Festive Decor',
    price: 349,
    description:
      'A tiny bouquet of crochet roses set in a cone or pot base — a sweet handmade accent for shelves, gifting, or festive decor corners.',
    color: '#a8283a',
    inStock: true,
    image: img('WhatsApp Image 2026-09-10 at 12.08.59.jpeg'),
  },
  {
    id: 'p16',
    name: 'Crochet Bell Anklet — Green',
    category: 'Anklets',
    price: 399,
    description:
      'A scalloped crochet anklet in emerald green, trimmed with tiny gold-tone bells for a soft jingle with every step — lightweight and comfortable for daily or festive wear.',
    color: '#1f7a4d',
    inStock: true,
    image: img('WhatsApp Image 2026-09-08 at 17.18.03.jpeg'),
  },
  {
    id: 'p17',
    name: 'Rainbow Charm — Bag, Car & Keychain',
    category: 'Charms & Keychains',
    price: 249,
    description:
      'A colourful crochet rainbow charm with a soft tassel or cloud finish that clips onto bags, keys, or a car mirror — customisable in colour and size for a cheerful accessory anywhere you go.',
    color: '#ef8b3f',
    inStock: true,
    image: img('WhatsApp Image 2026-09-01 at 12.10.10.jpeg'),
  },
  {
    id: 'p18',
    name: 'Beaded & Cowrie Shell Anklet Duo',
    category: 'Anklets',
    price: 449,
    description:
      'Two festive anklet styles — a red crochet anklet strung with rainbow beads, and a black anklet trimmed with colourful cowrie shells — perfect for Navratri and garba nights. Sold as a pair.',
    color: '#c8202f',
    inStock: true,
    image: img('WhatsApp Image 2026-09-15 at 16.33.02.jpeg'),
  },
  {
    id: 'p19',
    name: 'Evil Eye Anklet — Navy & White',
    category: 'Anklets',
    price: 429,
    description:
      'A crochet anklet in crisp navy and white, dotted with protective evil-eye beads — a modern accessory with a traditional touch, great for festive dancing.',
    color: '#1c3f7a',
    inStock: true,
    image: img('WhatsApp Image 2026-09-16 at 14.53.14.jpeg'),
  },
  {
    id: 'p20',
    name: 'Beaded Rainbow Ponytail Wrap',
    category: 'Hair Accessories',
    price: 449,
    description:
      'A playful multi-strand braided ponytail wrap woven with colourful beads and bells, equally lovely on a high ponytail, half-ponytail, or bun. Colours can be customised.',
    color: '#d94f8c',
    inStock: true,
    image: img('WhatsApp Image 2026-09-17 at 15.24.38.jpeg'),
  },
  {
    id: 'p21',
    name: 'Smiley Turtle Amigurumi',
    category: 'Toys',
    price: 449,
    description:
      'A huggable crochet turtle with a sage-green smiling face, a warm terracotta shell, and soft little flippers — a cheerful desk buddy or a first soft toy for a little one.',
    color: '#9caf88',
    inStock: true,
    image: img('processed/turtle-1.jpg'),
  },
  {
    id: 'p22',
    name: 'Sleepy Octopus Amigurumi',
    category: 'Toys',
    price: 499,
    description:
      'A dreamy blush-pink octopus amigurumi with sleepy embroidered eyes and eight plump curled legs — soft, squeezable, and perfectly nap-ready.',
    color: '#e6b8c9',
    inStock: true,
    image: img('processed/octopus-1.jpg'),
  },
  {
    id: 'p23',
    name: 'Blushing Buddy Bag Charm',
    category: 'Charms & Keychains',
    price: 279,
    description:
      'A round, rosy-cheeked crochet buddy with a soft grey-and-pink body and a long braided loop — clip it onto a bag or backpack for an instant dose of cute.',
    color: '#c9b7bb',
    inStock: true,
    image: img('processed/blob-charm-1.jpg'),
  },
  {
    id: 'p24',
    name: 'Sunset Rainbow Keychain',
    category: 'Charms & Keychains',
    price: 249,
    description:
      'A dreamy pink-orange-lilac crochet rainbow with a soft ivory tassel fringe, finished on a braided loop — a joyful little charm for keys, bags, or backpacks.',
    color: '#f2a65a',
    inStock: true,
    image: img('processed/rainbow-charm-sunset-1.jpg'),
  },
  {
    id: 'p25',
    name: 'Pastel Rainbow Keychain',
    category: 'Charms & Keychains',
    price: 249,
    description:
      'A cheerful golden-pink-blue crochet rainbow with a fluffy cream tassel fringe — the same beloved design in a brighter pastel palette.',
    color: '#f6c453',
    inStock: true,
    image: img('processed/rainbow-charm-pastel-1.jpg'),
  },
  {
    id: 'p26',
    name: 'Mini Headphones Charm',
    category: 'Charms & Keychains',
    price: 199,
    description:
      'A tiny crochet headphones charm in sunny yellow with blue-and-cream earcups — a fun, playful accessory for music lovers to clip onto bags or pouches.',
    color: '#f6c453',
    inStock: true,
    image: img('processed/headphones-charm-1.jpg'),
  },
  {
    id: 'p27',
    name: 'Paw Print Bag Charm',
    category: 'Charms & Keychains',
    price: 229,
    description:
      'A rust-brown crochet paw print charm with contrast black pads and a gold-tone clasp — a sweet gift for pet lovers to hang on a bag or keyring.',
    color: '#8a4b32',
    inStock: true,
    image: img('processed/pawprint-charm-1.jpg'),
  },
  {
    id: 'p28',
    name: 'Sunflower Brooch',
    category: 'Brooches',
    price: 199,
    description:
      'A sunny crochet sunflower brooch with golden layered petals, a rich brown centre, and a little green leaf — pin it onto a jacket, bag, or dupatta.',
    color: '#f0a500',
    inStock: true,
    image: img('processed/sunflower-brooch-1.jpg'),
  },
  {
    id: 'p29',
    name: 'Lilac Ruffle Scrunchie',
    category: 'Hair Accessories',
    price: 179,
    description:
      'A soft lilac crochet scrunchie with a frilly ruffled edge — gentle on hair and a pretty pop of pastel colour for everyday wear.',
    color: '#c9b6e4',
    inStock: true,
    image: img('processed/scrunchie-lilac-ruffle.jpg'),
  },
  {
    id: 'p30',
    name: 'Tricolour Ruffle Scrunchie',
    category: 'Hair Accessories',
    price: 179,
    description:
      'A festive ruffled crochet scrunchie in saffron, white, and green — perfect for Independence Day, Republic Day, or any patriotic occasion.',
    color: '#ff8c42',
    inStock: true,
    image: img('processed/scrunchie-tricolour.jpg'),
  },
  {
    id: 'p31',
    name: 'Mustard & Pink Ruffle Scrunchie',
    category: 'Hair Accessories',
    price: 179,
    description:
      'A warm mustard-yellow crochet scrunchie edged in soft pink ruffles — a cheerful two-tone accessory that pairs well with both ethnic and casual outfits.',
    color: '#e8b93a',
    inStock: true,
    image: img('processed/scrunchie-mustard-pink.jpg'),
  },
  {
    id: 'p32',
    name: 'Evil Eye Charm (Bag / Key / Car)',
    category: 'Charms & Keychains',
    price: 249,
    description:
      'A royal-blue crochet evil-eye charm with a scalloped edge — works equally well as a bag charm, keychain, or car mirror hanging. Colours can be customised.',
    color: '#1e4fa0',
    inStock: true,
    image: img('Collages/evil-eye-charm-collage.png'),
  },
  {
    id: 'p33',
    name: 'Paw Print Charm Collection',
    category: 'Charms & Keychains',
    price: 229,
    description:
      'A rust-and-black crochet paw print, styled as a bag charm, car mirror charm, keychain, or fridge magnet — a sweet gift for pet lovers, with fully customisable colours.',
    color: '#a0522d',
    inStock: true,
    image: img('Collages/pawprint-charm-collage.jpg'),
  },
];
