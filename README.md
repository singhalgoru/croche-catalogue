# 🧶 Crochet Corner — Crochet Catalogue Boilerplate

A boilerplate web catalogue for showcasing handmade crochet items: browsable
product grid, category filtering, search, and a product detail modal.

## Tech Stack

- **React 19** + **TypeScript** — component-driven UI, type safety
- **Vite** — fast dev server and production bundler
- **Tailwind CSS v4** — utility-first styling, no separate config file needed

This stack was chosen because a product showcase is mostly static, image-heavy
content: no backend is required, the whole site builds to static HTML/CSS/JS
that can be hosted for free (GitHub Pages, Netlify, Vercel, Cloudflare Pages),
and Vite/Tailwind keep iteration fast.

## Project Structure

```
src/
  components/       UI building blocks (Header, Footer, ProductCard, ProductGrid,
                     ProductModal, CategoryFilter, SearchBar)
  data/
    products.ts      Sample catalogue data — replace with your real products
    placeholderImage.ts  Generates placeholder images (swap for real photos)
  types/
    product.ts        Product & Category TypeScript types
  App.tsx             Wires search + filter + grid + modal together
```

## Getting Started

```bash
npm install
npm run dev       # start local dev server (http://localhost:5173)
npm run build     # type-check and produce a production build in dist/
npm run preview   # preview the production build locally
```

## Customizing the Catalogue

1. **Add your products** — edit [`src/data/products.ts`](./src/data/products.ts).
   Each product needs `id`, `name`, `category`, `price`, `description`,
   `color`, `inStock`, and `image`.
2. **Use real photos** — put images in `public/images/` and reference them
   as `/images/your-photo.jpg` instead of the generated `placeholderImage(...)`.
3. **Add/rename categories** — categories are derived automatically from the
   `category` field of your products; update the `Category` union type in
   [`src/types/product.ts`](./src/types/product.ts) to match.
4. **Restyle** — colors, spacing, and typography use Tailwind utility classes
   directly in each component under `src/components/`.

## Deploying

Since this builds to static files, you can deploy `dist/` (after `npm run build`)
to any static host:

- **GitHub Pages** — use the `gh-pages` package or a GitHub Actions workflow
- **Netlify / Vercel** — connect the repo; build command `npm run build`,
  publish directory `dist`
- **Cloudflare Pages** — same as above

## Pushing to Git

```bash
git init
git add .
git commit -m "Initial commit: crochet catalogue boilerplate"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```
