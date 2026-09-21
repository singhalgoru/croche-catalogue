import type { Page, Route } from '@playwright/test';

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  published: boolean;
  created_at: string;
  product_variants: VariantRow[];
}

export interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  color: string;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  sort_order: number;
}

export interface MockCatalogueState {
  categories: string[];
  categorySettings: Record<string, { priority: number; isFeatured: boolean }>;
  products: ProductRow[];
}

const image =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="%23f6c453"/%3E%3C/svg%3E';

const adminUser = {
  id: 'admin-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@luvia.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
};

const encodeTokenPart = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const createAccessToken = () => {
  const now = Math.floor(Date.now() / 1000);
  return `${encodeTokenPart({ alg: 'HS256', typ: 'JWT' })}.${encodeTokenPart({
    aud: 'authenticated',
    exp: now + 3600,
    iat: now,
    role: 'authenticated',
    sub: adminUser.id,
    email: adminUser.email,
  })}.test-signature`;
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-expose-headers': 'content-range' },
    body: JSON.stringify(body),
  });

const defaultProducts = (): ProductRow[] => [
  {
    id: 'product-1',
    name: 'Rose Charm',
    category: 'Charms',
    description: 'A detailed handmade rose charm for bags and keys.',
    color: '#f6c453',
    in_stock: true,
    image_path: 'seed/rose.jpg',
    image_url: image,
    published: true,
    created_at: '2026-01-01T00:00:00.000Z',
    product_variants: [
      {
        id: 'variant-1',
        product_id: 'product-1',
        name: 'Rose Pink',
        color: '#f6c453',
        in_stock: true,
        image_path: 'seed/rose.jpg',
        image_url: image,
        sort_order: 0,
      },
      {
        id: 'variant-2',
        product_id: 'product-1',
        name: 'Ivory',
        color: '#fffaf0',
        in_stock: false,
        image_path: 'seed/rose-ivory.jpg',
        image_url: image,
        sort_order: 1,
      },
    ],
  },
  {
    id: 'product-2',
    name: 'Flower Coaster',
    category: 'Home Decor',
    description: 'A cheerful crochet coaster for a cosy table setting.',
    color: '#e2a933',
    in_stock: false,
    image_path: 'seed/coaster.jpg',
    image_url: image,
    published: true,
    created_at: '2026-01-02T00:00:00.000Z',
    product_variants: [
      {
        id: 'variant-3',
        product_id: 'product-2',
        name: 'Default',
        color: '#e2a933',
        in_stock: false,
        image_path: 'seed/coaster.jpg',
        image_url: image,
        sort_order: 0,
      },
    ],
  },
];

const getRequestBody = <T>(route: Route) => route.request().postDataJSON() as T;

export async function installMockSupabase(page: Page): Promise<MockCatalogueState> {
  const state: MockCatalogueState = {
    categories: ['Charms', 'Home Decor'],
    categorySettings: {
      Charms: { priority: 20, isFeatured: false },
      'Home Decor': { priority: 10, isFeatured: true },
    },
    products: defaultProducts(),
  };

  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) => route.abort());

  await page.route('http://supabase.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname === '/auth/v1/token') {
      const session = {
        access_token: createAccessToken(),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user: adminUser,
      };
      await json(route, session);
      return;
    }

    if (pathname === '/auth/v1/user') {
      await json(route, adminUser);
      return;
    }

    if (pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === '/rest/v1/rpc/is_catalogue_admin') {
      await json(route, true);
      return;
    }

    if (pathname === '/rest/v1/rpc/rename_catalogue_category') {
      const body = getRequestBody<{ current_name: string; replacement_name: string }>(route);
      state.categories = state.categories.map((category) =>
        category === body.current_name ? body.replacement_name : category,
      );
      state.categorySettings[body.replacement_name] =
        state.categorySettings[body.current_name] ?? { priority: 100, isFeatured: false };
      delete state.categorySettings[body.current_name];
      state.products = state.products.map((product) =>
        product.category === body.current_name
          ? { ...product, category: body.replacement_name }
          : product,
      );
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === '/rest/v1/rpc/update_catalogue_category_presentation') {
      const body = getRequestBody<{
        category_name: string;
        category_priority: number;
        featured: boolean;
      }>(route);
      if (body.featured) {
        for (const category of Object.values(state.categorySettings)) {
          category.isFeatured = false;
        }
      }
      state.categorySettings[body.category_name] = {
        priority: body.category_priority,
        isFeatured:
          body.featured || state.categorySettings[body.category_name]?.isFeatured === true,
      };
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === '/rest/v1/categories') {
      if (request.method() === 'GET') {
        await json(
          route,
          state.categories
            .map((name) => ({
              name,
              sort_order: state.categorySettings[name]?.priority ?? 100,
              is_featured: state.categorySettings[name]?.isFeatured ?? false,
            }))
            .sort(
              (left, right) =>
                Number(right.is_featured) - Number(left.is_featured) ||
                left.sort_order - right.sort_order ||
                left.name.localeCompare(right.name),
            ),
        );
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<{ name: string }>(route);
        state.categories.push(body.name);
        state.categorySettings[body.name] = { priority: 100, isFeatured: false };
        await route.fulfill({ status: 201 });
        return;
      }

      if (request.method() === 'DELETE') {
        const name = url.searchParams.get('name')?.replace(/^eq\./, '');
        state.categories = state.categories.filter((category) => category !== name);
        if (name) delete state.categorySettings[name];
        await route.fulfill({ status: 204 });
        return;
      }
    }

    if (pathname === '/rest/v1/products') {
      if (request.method() === 'GET') {
        const publishedOnly = url.searchParams.get('published') === 'eq.true';
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const products = (publishedOnly
          ? state.products.filter((product) => product.published)
          : state.products
        ).filter((product) => !id || product.id === id);
        const wantsSingle = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
        await json(route, wantsSingle ? products[0] : products);
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<Omit<ProductRow, 'id' | 'created_at' | 'product_variants'>>(route);
        const product: ProductRow = {
          ...body,
          id: `product-${state.products.length + 1}`,
          created_at: new Date().toISOString(),
          product_variants: [],
        };
        state.products.push(product);
        await json(route, product, 201);
        return;
      }

      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const index = state.products.findIndex((product) => product.id === id);

      if (request.method() === 'PATCH' && index >= 0) {
        const changes = getRequestBody<Partial<ProductRow>>(route);
        state.products[index] = { ...state.products[index], ...changes };
        await json(route, state.products[index]);
        return;
      }

      if (request.method() === 'DELETE') {
        state.products = state.products.filter((product) => product.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
    }

    if (pathname === '/rest/v1/product_variants') {
      if (request.method() === 'POST') {
        const body = getRequestBody<
          | Omit<VariantRow, 'id'>
          | Array<Omit<VariantRow, 'id'>>
        >(route);
        const additions = (Array.isArray(body) ? body : [body]).map((variant, index) => ({
          ...variant,
          id: `variant-${state.products.reduce(
            (count, product) => count + product.product_variants.length,
            1,
          ) + index}`,
        }));
        for (const variant of additions) {
          const product = state.products.find((item) => item.id === variant.product_id);
          product?.product_variants.push(variant);
        }
        await json(route, additions, 201);
        return;
      }

      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const product = state.products.find((item) =>
        item.product_variants.some((variant) => variant.id === id),
      );
      const variantIndex = product?.product_variants.findIndex((variant) => variant.id === id) ?? -1;

      if (request.method() === 'PATCH' && product && variantIndex >= 0) {
        const changes = getRequestBody<Partial<VariantRow>>(route);
        product.product_variants[variantIndex] = {
          ...product.product_variants[variantIndex],
          ...changes,
        };
        await json(route, product.product_variants[variantIndex]);
        return;
      }

      if (request.method() === 'DELETE' && product) {
        product.product_variants = product.product_variants.filter((variant) => variant.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
    }

    if (pathname === '/functions/v1/analyze-product') {
      await json(route, {
        name: 'AI Bunny',
        category: state.categories[0],
        description: 'A soft handmade crochet bunny suggested by Gemini.',
        color: '#d8b4e2',
      });
      return;
    }

    if (pathname === '/functions/v1/enhance-product-image') {
      await json(route, {
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
        mimeType: 'image/png',
        model: '@cf/black-forest-labs/flux-2-klein-9b',
      });
      return;
    }

    if (
      pathname === '/storage/v1/object/product-images' ||
      pathname.startsWith('/storage/v1/object/product-images/')
    ) {
      await json(route, { Key: pathname.replace('/storage/v1/object/', '') });
      return;
    }

    await json(route, { message: `Unhandled test request: ${request.method()} ${pathname}` }, 500);
  });

  return state;
}
