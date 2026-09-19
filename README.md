# Luvia Crochet Catalogue

A mobile-friendly React catalogue for Luvia handmade crochet products. It
includes category filtering, search, product detail carousels, WhatsApp
enquiries, and a protected admin workflow that can analyse a new product photo
with Google Gemini and publish it to the catalogue.

## Technology

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Supabase Auth, Postgres, Storage, and Edge Functions
- Google Gemini 3.7 Flash for product image analysis, with 3.5 and 3.1 Flash Lite fallbacks
- GitHub Pages with automatic deployment from `main`

The original products in `src/data/products.ts` remain part of the static site.
Products uploaded through the admin screen are loaded from Supabase and shown
alongside them.

## Local development

```bash
npm install
npm run dev
```

Without Supabase environment variables, the public catalogue still works with
the original static products. The admin screen explains that setup is needed.

## One-time Supabase and Gemini setup

### 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com/) and create a new project.
2. In **Project Settings → API**, copy:
   - Project URL
   - Publishable/anon key
   - Project reference ID
3. Copy `.env.example` to `.env.local` and enter the URL and anon key:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The anon key is designed for browser use. Access is still restricted by the
Row Level Security policies in the migration. Never put a service-role key in
the website or GitHub Pages secrets.

### 2. Create the database and image bucket

The quickest option is the Supabase SQL Editor:

1. Open **SQL Editor** in the Supabase dashboard.
2. Copy and run the complete contents of
   `supabase/migrations/20260919073000_create_catalogue_products.sql`.

This creates the product table, public image bucket, and policies that allow
everyone to read published products while only authenticated admins can
create or modify them.

Alternatively, with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 3. Create the single admin account

1. Open **Authentication → Users** in Supabase.
2. Select **Add user → Create new user**.
3. Enter the email and password that will be used for catalogue administration.
4. Copy the new user's UUID and run this in the SQL Editor:

```sql
insert into public.catalogue_admins (user_id)
values ('PASTE_THE_USER_UUID_HERE');
```

5. In the authentication settings, keep public user registration disabled.

The app deliberately has no sign-up page. Only an account created by you in
the Supabase dashboard and explicitly added to `catalogue_admins` can upload
images, generate Gemini descriptions, or publish products.

### 4. Create and secure the Gemini key

1. Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Link the local repository to Supabase if not already linked:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

3. Store the Gemini key as a Supabase Edge Function secret:

```bash
npx supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

4. Deploy the image-analysis function:

```bash
npx supabase functions deploy analyze-product
```

The Gemini key is used only inside the Edge Function. It is never sent to the
browser or stored in GitHub.

### 5. Configure GitHub Pages

Add these repository secrets under **GitHub → repository Settings → Secrets
and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

They can also be set with GitHub CLI:

```bash
gh secret set VITE_SUPABASE_URL
gh secret set VITE_SUPABASE_ANON_KEY
```

Push to `main`. The workflow in `.github/workflows/deploy.yml` rebuilds and
deploys the site automatically.

## Adding a product

1. Open the admin screen:
   `https://singhalgoru.github.io/croche-catalogue/#admin`
2. Sign in with the Supabase admin account.
3. Choose a JPG, PNG, or WebP product photo smaller than 6 MB.
4. Select **Generate details with Gemini**.
5. Review and edit the suggested name, category, description, and colour.
6. Select **Publish product**.

Publishing uploads the image to Supabase Storage and inserts the reviewed
metadata into Postgres. The new product appears in the public catalogue
without a Git commit or GitHub Pages redeployment.

## Updating or removing a product

1. Open the admin screen and sign in.
2. Scroll to **Manage products**.
3. Select **Edit** to change the name, category, description, accent colour,
   stock status, catalogue visibility, or product image.
4. Select **Remove**, then confirm, to permanently remove a product.

The existing catalogue records are stored in Supabase, so updates and removals
take effect immediately without a Git commit. Original images that shipped with
the repository remain in `public/images`; newly uploaded and replacement images
are stored in the Supabase `product-images` bucket.

## Validation

```bash
npm run build
npm run lint
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`. GitHub Pages serves
the result at:

https://singhalgoru.github.io/croche-catalogue/
