import type { Page, Route } from '@playwright/test';

export interface ProductRow {
  id: string;
  sort_order: number;
  name: string;
  category: string;
  description: string;
  seo_description?: string | null;
  color: string;
  in_stock: boolean;
  available_quantity: number;
  image_path: string;
  image_url: string;
  published: boolean;
  published_at: string | null;
  featured: boolean;
  price: number | null;
  show_price: boolean;
  created_at: string;
  product_variants: VariantRow[];
}

export interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  color: string;
  price: number | null;
  in_stock: boolean;
  image_path: string;
  image_url: string;
  sort_order: number;
  product_variant_images: GalleryImageRow[];
}

export interface GalleryImageRow {
  id: string;
  variant_id: string;
  image_path: string;
  image_url: string;
  sort_order: number;
}

export interface MockCatalogueState {
  categories: string[];
  categorySettings: Record<string, { priority: number }>;
  products: ProductRow[];
  carts: CartRow[];
  cartSessionBlocks: { user_id: string; created_at: string }[];
  tickerMessages: TickerMessageRow[];
}

export interface TickerMessageRow {
  id: string;
  message: string;
  is_active: boolean;
  sort_order: number;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  image_url: string;
  unit_price: number | null;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface CartRow {
  delivery_pin_code?: string | null;
  delivery_pin_location?: { districts: string[]; states: string[]; country: 'India' } | null;
  delivery_pin_checked_at?: string | null;
  id: string;
  user_id: string;
  reference: string;
  status: 'active' | 'whatsapp_started';
  created_at: string;
  updated_at: string;
  expires_at: string;
  whatsapp_started_at: string | null;
  cart_items: CartItemRow[];
}

const image =
  'http://supabase.test/storage/v1/object/public/product-images/seed/mock.png';
const imageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
  'base64',
);

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

const anonymousUser = {
  ...adminUser,
  id: 'anonymous-user',
  email: '',
  email_confirmed_at: null,
  confirmed_at: null,
  app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
  is_anonymous: true,
};

const encodeTokenPart = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const createAccessToken = (user = adminUser) => {
  const now = Math.floor(Date.now() / 1000);
  return `${encodeTokenPart({ alg: 'HS256', typ: 'JWT' })}.${encodeTokenPart({
    aud: 'authenticated',
    exp: now + 3600,
    iat: now,
    role: 'authenticated',
    sub: user.id,
    email: user.email,
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
    sort_order: 0,
    name: 'Rose Charm',
    category: 'Charms',
    description: 'A detailed handmade rose charm for bags and keys.',
    color: '#f6c453',
    in_stock: true,
    image_path: 'seed/rose.jpg',
    image_url: image,
    published: true,
    published_at: '2025-01-01T00:00:00.000Z',
    featured: true,
    price: 349,
    show_price: true,
    created_at: '2026-01-01T00:00:00.000Z',
    product_variants: [
      {
        id: 'variant-1',
        product_id: 'product-1',
        name: 'Rose Pink',
        color: '#f6c453',
        price: null,
        in_stock: true,
        available_quantity: 3,
        image_path: 'seed/rose.jpg',
        image_url: image,
        sort_order: 0,
        product_variant_images: [
          {
            id: 'gallery-1',
            variant_id: 'variant-1',
            image_path: 'seed/rose-angle.jpg',
            image_url: image,
            sort_order: 0,
          },
        ],
      },
      {
        id: 'variant-2',
        product_id: 'product-1',
        name: 'Ivory',
        color: '#fffaf0',
        price: null,
        in_stock: false,
        available_quantity: 0,
        image_path: 'seed/rose-ivory.jpg',
        image_url: image,
        sort_order: 1,
        product_variant_images: [],
      },
    ],
  },
  {
    id: 'product-2',
    sort_order: 2,
    name: 'Flower Coaster',
    category: 'Home Decor',
    description: 'A cheerful crochet coaster for a cosy table setting.',
    color: '#e2a933',
    in_stock: false,
    image_path: 'seed/coaster.jpg',
    image_url: image,
    published: true,
    published_at: '2025-01-02T00:00:00.000Z',
    featured: false,
    price: 249,
    show_price: false,
    created_at: '2026-01-02T00:00:00.000Z',
    product_variants: [
      {
        id: 'variant-3',
        product_id: 'product-2',
        name: 'Standard',
        color: '#e2a933',
        price: null,
        in_stock: false,
        available_quantity: 0,
        image_path: 'seed/coaster.jpg',
        image_url: image,
        sort_order: 0,
        product_variant_images: [],
      },
    ],
  },
  {
    id: 'product-3',
    sort_order: 1,
    name: 'New Heart Charm',
    category: 'Charms',
    description: 'A newly published crochet heart charm.',
    color: '#d96c75',
    in_stock: true,
    image_path: 'seed/heart.jpg',
    image_url: image,
    published: true,
    published_at: new Date().toISOString(),
    featured: false,
    price: null,
    show_price: false,
    created_at: '2026-01-03T00:00:00.000Z',
    product_variants: [
      {
        id: 'variant-4',
        product_id: 'product-3',
        name: 'Standard',
        color: '#d96c75',
        price: null,
        in_stock: true,
        available_quantity: 1,
        image_path: 'seed/heart.jpg',
        image_url: image,
        sort_order: 0,
        product_variant_images: [],
      },
    ],
  },
];

const getRequestBody = <T>(route: Route) => route.request().postDataJSON() as T;

export async function installMockSupabase(page: Page): Promise<MockCatalogueState> {
  const state: MockCatalogueState = {
    categories: ['Charms', 'Home Decor', 'Empty Category'],
    categorySettings: {
      Charms: { priority: 20 },
      'Home Decor': { priority: 10 },
      'Empty Category': { priority: 30 },
    },
    products: defaultProducts(),
    carts: [],
    cartSessionBlocks: [],
    tickerMessages: [
      {
        id: 'ticker-1',
        message: '🚚 Shipping available across India',
        is_active: true,
        sort_order: 0,
      },
      {
        id: 'ticker-2',
        message: 'Fresh crochet gifts added weekly',
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'ticker-3',
        message: 'Hidden ticker message',
        is_active: false,
        sort_order: 2,
      },
    ],
  };
  let currentUser = adminUser;
  let customerUser: typeof adminUser | null = null;
  let pendingCustomerEmail = '';

  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) => route.abort());
  await page.route('https://connect.facebook.net/**', (route) => route.abort());

  await page.route('http://supabase.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname === '/auth/v1/token') {
      currentUser = adminUser;
      const session = {
        access_token: createAccessToken(adminUser),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user: adminUser,
      };
      await json(route, session);
      return;
    }

    if (pathname === '/auth/v1/signup') {
      currentUser = anonymousUser;
      const session = {
        access_token: createAccessToken(anonymousUser),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'anonymous-refresh-token',
        user: anonymousUser,
      };
      await json(route, session);
      return;
    }

    if (pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') {
        pendingCustomerEmail = getRequestBody<{ email: string }>(route).email;
      }
      await json(route, currentUser);
      return;
    }

    if (pathname === '/auth/v1/otp') {
      const body = getRequestBody<{ email: string; create_user: boolean }>(route);
      if (!customerUser || body.email !== customerUser.email || body.create_user !== false) {
        await json(route, { msg: 'Registered customer required.' }, 400);
      } else await json(route, {});
      return;
    }

    if (pathname === '/auth/v1/verify') {
      const body = getRequestBody<{ email: string; token: string; type: string }>(route);
      if (body.token !== '123456' || (body.type === 'email_change'
        ? body.email !== pendingCustomerEmail : body.email !== customerUser?.email)) {
        await json(route, { msg: 'Expired or invalid verification code.' }, 403);
        return;
      }
      if (body.type === 'email_change') {
        customerUser = { ...currentUser, email: body.email, is_anonymous: false,
          email_confirmed_at: new Date().toISOString(), confirmed_at: new Date().toISOString() };
      }
      if (!customerUser) { await json(route, { msg: 'Customer not found.' }, 400); return; }
      currentUser = customerUser;
      await json(route, { access_token: createAccessToken(currentUser), token_type: 'bearer',
        expires_in: 3600, refresh_token: 'customer-refresh-token', user: currentUser });
      return;
    }

    if (pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === '/rest/v1/rpc/is_catalogue_admin') {
      await json(route, currentUser.is_anonymous !== true);
      return;
    }

    if (pathname === '/rest/v1/product_profit_margins' && request.method() === 'DELETE') {
      await json(route, []);
      return;
    }

    if (pathname === '/rest/v1/rpc/bulk_update_product_descriptions') {
      const body = getRequestBody<{ changes: Array<{
        id: string; description: string; seoDescription: string;
        originalDescription: string; originalSeoDescription: string;
      }> }>(route);
      const conflict = body.changes.some(change => {
        const product = state.products.find(item => item.id === change.id);
        return !product || product.description !== change.originalDescription ||
          (product.seo_description ?? '') !== change.originalSeoDescription;
      });
      if (conflict) { await json(route, { message: 'Products changed; no changes saved.' }, 409); return; }
      for (const change of body.changes) {
        const product = state.products.find(item => item.id === change.id)!;
        product.description = change.description;
        product.seo_description = change.seoDescription || null;
      }
      await json(route, body.changes.length);
      return;
    }

    if (pathname === '/rest/v1/rpc/record_variant_sale') {
      const body = getRequestBody<{ target_variant_id: string; sold_quantity: number }>(route);
      const product = state.products.find((item) =>
        item.product_variants.some((variant) => variant.id === body.target_variant_id),
      );
      const variant = product?.product_variants.find(
        (item) => item.id === body.target_variant_id,
      );
      if (!product || !variant || body.sold_quantity < 1 || body.sold_quantity > variant.available_quantity) {
        await json(route, { message: 'Not enough inventory is available for this sale.' }, 400);
        return;
      }

      variant.available_quantity -= body.sold_quantity;
      variant.in_stock = variant.in_stock && variant.available_quantity > 0;
      product.in_stock = product.product_variants.some((item) => item.in_stock);
      await json(route, null);
      return;
    }

    if (pathname === '/rest/v1/rpc/add_variant_stock') {
      const body = getRequestBody<{ target_variant_id: string; added_quantity: number }>(route);
      const product = state.products.find((item) =>
        item.product_variants.some((variant) => variant.id === body.target_variant_id),
      );
      const variant = product?.product_variants.find(
        (item) => item.id === body.target_variant_id,
      );
      if (!product || !variant || body.added_quantity < 1) {
        await json(route, { message: 'Unable to add stock.' }, 400);
        return;
      }
      variant.available_quantity += body.added_quantity;
      variant.in_stock = true;
      product.in_stock = true;
      await json(route, null);
      return;
    }

    if (pathname === '/rest/v1/rpc/reorder_catalogue_products') {
      const body = getRequestBody<{ ordered_product_ids: string[] }>(route);
      if (currentUser.is_anonymous) {
        await json(route, { message: 'Admin access required.' }, 403);
        return;
      }
      if (
        body.ordered_product_ids.length !== state.products.length ||
        new Set(body.ordered_product_ids).size !== state.products.length ||
        body.ordered_product_ids.some(
          (id) => !state.products.some((product) => product.id === id),
        )
      ) {
        await json(
          route,
          { message: 'Product ordering must include every product exactly once.' },
          400,
        );
        return;
      }
      body.ordered_product_ids.forEach((id, sortOrder) => {
        const product = state.products.find((item) => item.id === id);
        if (product) product.sort_order = sortOrder;
      });
      await json(route, null);
      return;
    }

    if (pathname === '/rest/v1/cart_session_blocks') {
      const userId = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      if (request.method() === 'GET') await json(route, state.cartSessionBlocks);
      else if (request.method() === 'POST') {
        const body = getRequestBody<{ user_id: string }>(route);
        if (!state.cartSessionBlocks.some(block => block.user_id === body.user_id)) {
          state.cartSessionBlocks.push({ user_id: body.user_id, created_at: new Date().toISOString() });
        }
        await json(route, []);
      } else if (request.method() === 'DELETE') {
        state.cartSessionBlocks = state.cartSessionBlocks.filter(block => block.user_id !== userId);
        await json(route, []);
      } else await json(route, { message: 'Unsupported block operation' }, 400);
      return;
    }
    if (pathname === '/rest/v1/carts') {
      const userId = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      const cartId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const wantsSingle = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');

      if (request.method() === 'GET') {
        const carts = state.carts.filter(
          (cart) => (!userId || cart.user_id === userId) && (!cartId || cart.id === cartId),
        );
        await json(route, wantsSingle ? (carts[0] ?? null) : carts);
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<{ user_id: string }>(route);
        const now = new Date().toISOString();
        const cart: CartRow = {
          id: `cart-${state.carts.length + 1}`,
          user_id: body.user_id,
          reference: `CRT-TEST000${state.carts.length + 1}`,
          status: 'active',
          created_at: now,
          updated_at: now,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          whatsapp_started_at: null,
          cart_items: [],
        };
        state.carts.push(cart);
        await json(route, wantsSingle ? cart : [cart], 201);
        return;
      }

      if (request.method() === 'PATCH') {
        const changes = getRequestBody<Partial<CartRow>>(route);
        const cart = state.carts.find((candidate) => candidate.id === cartId);
        if (cart) Object.assign(cart, changes);
        await json(route, wantsSingle ? cart : cart ? [cart] : []);
        return;
      }

      if (request.method() === 'DELETE') {
        state.carts = state.carts.filter((cart) => cart.id !== cartId);
        await json(route, []);
        return;
      }
    }

    if (pathname === '/rest/v1/ticker_messages') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const activeOnly = url.searchParams.get('is_active') === 'eq.true';

      if (request.method() === 'GET') {
        const messages = state.tickerMessages
          .filter((item) => (!id || item.id === id) && (!activeOnly || item.is_active))
          .sort((left, right) => left.sort_order - right.sort_order);
        await json(route, messages);
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<Omit<TickerMessageRow, 'id'>>(route);
        state.tickerMessages.push({
          ...body,
          id: `ticker-${state.tickerMessages.length + 1}`,
        });
        await json(route, [], 201);
        return;
      }

      if (request.method() === 'PATCH') {
        const item = state.tickerMessages.find((candidate) => candidate.id === id);
        if (item) Object.assign(item, getRequestBody<Partial<TickerMessageRow>>(route));
        await json(route, []);
        return;
      }

      if (request.method() === 'DELETE') {
        state.tickerMessages = state.tickerMessages.filter((item) => item.id !== id);
        await json(route, []);
        return;
      }
    }

    if (pathname === '/rest/v1/cart_items') {
      const cartId = url.searchParams.get('cart_id')?.replace(/^eq\./, '');
      const itemId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const cart = state.carts.find((candidate) => candidate.id === cartId);

      if (request.method() === 'POST') {
        const body = getRequestBody<Omit<CartItemRow, 'id' | 'created_at'>>(route);
        const targetCart = state.carts.find((candidate) => candidate.id === body.cart_id);
        if (!targetCart) {
          await json(route, { message: 'Cart not found' }, 404);
          return;
        }
        const existing = targetCart.cart_items.find(
          (item) =>
            item.product_id === body.product_id && item.variant_id === body.variant_id,
        );
        if (existing) {
          Object.assign(existing, body);
        } else {
          targetCart.cart_items.push({
            ...body,
            id: `cart-item-${Date.now()}`,
            created_at: new Date().toISOString(),
          });
        }
        await json(route, []);
        return;
      }

      const containingCart =
        cart ?? state.carts.find((candidate) => candidate.cart_items.some((item) => item.id === itemId));

      if (request.method() === 'PATCH' && containingCart) {
        const item = containingCart.cart_items.find((candidate) => candidate.id === itemId);
        if (item) Object.assign(item, getRequestBody<Partial<CartItemRow>>(route));
        await json(route, []);
        return;
      }

      if (request.method() === 'DELETE' && containingCart) {
        containingCart.cart_items = containingCart.cart_items.filter(
          (item) => (itemId ? item.id !== itemId : false),
        );
        await json(route, []);
        return;
      }
    }

    if (pathname === '/rest/v1/rpc/rename_catalogue_category') {
      const body = getRequestBody<{ current_name: string; replacement_name: string }>(route);
      state.categories = state.categories.map((category) =>
        category === body.current_name ? body.replacement_name : category,
      );
      state.categorySettings[body.replacement_name] =
        state.categorySettings[body.current_name] ?? { priority: 100 };
      delete state.categorySettings[body.current_name];
      state.products = state.products.map((product) =>
        product.category === body.current_name
          ? { ...product, category: body.replacement_name }
          : product,
      );
      await route.fulfill({ status: 204 });
      return;
    }

    if (pathname === '/rest/v1/rpc/update_catalogue_category_priority') {
      const body = getRequestBody<{
        category_name: string;
        category_priority: number;
      }>(route);
      state.categorySettings[body.category_name] = {
        priority: body.category_priority,
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
            }))
            .sort(
              (left, right) =>
                left.sort_order - right.sort_order ||
                left.name.localeCompare(right.name),
            ),
        );
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<{ name: string }>(route);
        state.categories.push(body.name);
        state.categorySettings[body.name] = { priority: 100 };
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
        )
          .filter((product) => !id || product.id === id)
          .sort(
            (left, right) =>
              (url.searchParams.get('order')?.startsWith('sort_order.desc')
                ? right.sort_order - left.sort_order
                : left.sort_order - right.sort_order) ||
              left.created_at.localeCompare(right.created_at),
          );
        const limit = Number(url.searchParams.get('limit'));
        const limitedProducts = limit > 0 ? products.slice(0, limit) : products;
        const wantsSingle = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
        await json(route, wantsSingle ? limitedProducts[0] : limitedProducts);
        return;
      }

      if (request.method() === 'POST') {
        const body = getRequestBody<
          Omit<ProductRow, 'id' | 'created_at' | 'published_at' | 'product_variants'>
        >(route);
        const product: ProductRow = {
          ...body,
          id: `product-${state.products.length + 1}`,
          created_at: new Date().toISOString(),
          published_at: body.published ? new Date().toISOString() : null,
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
        if (changes.published && !state.products[index].published) {
          changes.published_at = new Date().toISOString();
        }
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
          product_variant_images: [] as GalleryImageRow[],
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

    if (pathname === '/rest/v1/product_variant_images') {
      const findVariant = (variantId: string) =>
        state.products
          .flatMap((product) => product.product_variants)
          .find((variant) => variant.id === variantId);

      if (request.method() === 'POST') {
        const body = getRequestBody<Omit<GalleryImageRow, 'id'>>(route);
        const created: GalleryImageRow = {
          ...body,
          id: `gallery-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
        };
        findVariant(body.variant_id)?.product_variant_images.push(created);
        await json(route, [created], 201);
        return;
      }

      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const variant = state.products
        .flatMap((product) => product.product_variants)
        .find((item) => item.product_variant_images.some((image) => image.id === id));
      const imageIndex = variant?.product_variant_images.findIndex((image) => image.id === id) ?? -1;

      if (request.method() === 'PATCH' && variant && imageIndex >= 0) {
        const changes = getRequestBody<Partial<GalleryImageRow>>(route);
        variant.product_variant_images[imageIndex] = {
          ...variant.product_variant_images[imageIndex],
          ...changes,
        };
        await json(route, [variant.product_variant_images[imageIndex]]);
        return;
      }

      if (request.method() === 'DELETE' && variant && imageIndex >= 0) {
        const [removed] = variant.product_variant_images.splice(imageIndex, 1);
        await json(route, [removed]);
        return;
      }

      // Row not found for this id: mirrors RLS blocking a write by matching
      // zero rows, so the app's defensive "no matching row" checks get
      // exercised in tests too.
      await json(route, []);
      return;
    }

    if (pathname === '/functions/v1/capture-cart-network') {
      await json(route, { recorded: true });
      return;
    }

    if (pathname === '/functions/v1/verify-delivery-pin') {
      const body = getRequestBody<{ cartId: string; pin: string }>(route);
      if (body.pin !== '110001') {
        await json(route, { error: 'Enter a valid pincode or keep it empty.' }, 422);
        return;
      }
      const cart = state.carts.find(item => item.id === body.cartId);
      if (!cart) { await json(route, { error: 'Cart not found.' }, 400); return; }
      const location = { districts: ['Central Delhi'], states: ['Delhi'], country: 'India' as const };
      cart.delivery_pin_code = body.pin;
      cart.delivery_pin_location = location;
      cart.delivery_pin_checked_at = new Date().toISOString();
      await json(route, { location, checkedAt: cart.delivery_pin_checked_at });
      return;
    }
    if (pathname === '/functions/v1/analyze-product') {
      const body = getRequestBody<{ mode?: string }>(route);
      if (body.mode === 'variant-name') {
        await json(route, { name: 'Ocean Blue', color: '#3b82c4' });
        return;
      }
      await json(route, {
        name: 'AI Bunny',
        category: state.categories[0],
        description: 'A soft handmade crochet bunny suggested by Gemini.',
        seoDescription: 'Handmade crochet bunny with a pastel finish.',
        color: '#d8b4e2',
      });
      return;
    }

    if (pathname === '/functions/v1/optimize-image-prompt') {
      await json(route, {
        prompt:
          'Style on warm cream linen with soft morning light, subtle handmade gift props, and a premium crochet catalogue look.',
      });
      return;
    }

    if (pathname === '/functions/v1/enhance-product-image') {
      const body = getRequestBody<{ provider?: string }>(route);
      const provider = body.provider || 'auto';
      await json(route, {
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
        mimeType: 'image/png',
        provider,
        model:
          provider === 'openai'
            ? 'dall-e-2'
            : provider === 'gemini'
              ? 'gemini-3.1-flash-image'
              : '@cf/black-forest-labs/flux-2-klein-9b',
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname.startsWith('/storage/v1/object/public/product-images/')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: imageBuffer,
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
