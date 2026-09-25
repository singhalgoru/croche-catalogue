import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Product, ProductVariant } from '../types/product';
import type { AdminCart, Cart, CartItem } from '../types/cart';

interface CartItemRow {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  image_url: string;
  unit_price: number | null;
  quantity: number;
}

interface CartRow {
  id: string;
  user_id: string;
  reference: string;
  status: Cart['status'];
  created_at: string;
  updated_at: string;
  expires_at: string;
  whatsapp_started_at: string | null;
  cart_items?: CartItemRow[];
}

const CART_COLUMNS =
  'id, user_id, reference, status, created_at, updated_at, expires_at, whatsapp_started_at, cart_items(id, product_id, variant_id, product_name, variant_name, image_url, unit_price, quantity, created_at)';
const LOCAL_CART_KEY = 'luvia-cart';
const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const mapItem = (row: CartItemRow): CartItem => ({
  id: row.id,
  productId: row.product_id,
  variantId: row.variant_id,
  productName: row.product_name,
  variantName: row.variant_name,
  image: row.image_url,
  unitPrice: row.unit_price,
  quantity: row.quantity,
});

const mapCart = (row: CartRow): Cart => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  whatsappStartedAt: row.whatsapp_started_at,
  items: (row.cart_items ?? []).map(mapItem),
});

const createLocalCart = (): Cart => {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    reference: `CRT-${suffix}`,
    status: 'active',
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CART_LIFETIME_MS).toISOString(),
    whatsappStartedAt: null,
    items: [],
  };
};

const readLocalCart = (): Cart => {
  try {
    const stored = localStorage.getItem(LOCAL_CART_KEY);
    if (!stored) return createLocalCart();
    const cart = JSON.parse(stored) as Cart;
    if (new Date(cart.expiresAt).getTime() <= Date.now()) return createLocalCart();
    return cart;
  } catch {
    return createLocalCart();
  }
};

const writeLocalCart = (cart: Cart) => {
  localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cart));
  return cart;
};

const refreshLocalCart = (cart: Cart): Cart => {
  const now = new Date();
  return {
    ...cart,
    status: 'active',
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CART_LIFETIME_MS).toISOString(),
    whatsappStartedAt: null,
  };
};

const ensureCartSession = async () => {
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore your cart session: ${sessionError.message}`);
  if (sessionData.session) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Unable to create an anonymous cart session: ${error.message}. Enable anonymous sign-ins in Supabase Auth settings.`,
    );
  }
  if (!data.user) throw new Error('Supabase did not return an anonymous cart user.');
  return data.user;
};

const loadRemoteCart = async (): Promise<Cart> => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const user = await ensureCartSession();
  if (!user) throw new Error('Unable to identify the cart owner.');

  const { data: existing, error: loadError } = await supabase
    .from('carts')
    .select(CART_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();
  if (loadError) throw new Error(`Unable to load your cart: ${loadError.message}`);

  if (existing && new Date((existing as CartRow).expires_at).getTime() > Date.now()) {
    return mapCart(existing as CartRow);
  }

  if (existing) {
    const { error: clearError } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', (existing as CartRow).id);
    if (clearError) throw new Error(`Unable to clear the expired cart: ${clearError.message}`);

    const { data, error } = await supabase
      .from('carts')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CART_LIFETIME_MS).toISOString(),
        whatsapp_started_at: null,
      })
      .eq('id', (existing as CartRow).id)
      .select(CART_COLUMNS)
      .single();
    if (error) throw new Error(`Unable to renew your cart: ${error.message}`);
    return mapCart(data as CartRow);
  }

  const { data, error } = await supabase
    .from('carts')
    .insert({ user_id: user.id })
    .select(CART_COLUMNS)
    .single();
  if (error) {
    const { data: racedCart, error: reloadError } = await supabase
      .from('carts')
      .select(CART_COLUMNS)
      .eq('user_id', user.id)
      .single();
    if (reloadError) throw new Error(`Unable to create your cart: ${error.message}`);
    return mapCart(racedCart as CartRow);
  }
  return mapCart(data as CartRow);
};

const touchRemoteCart = async (cartId: string) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('carts')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CART_LIFETIME_MS).toISOString(),
      whatsapp_started_at: null,
    })
    .eq('id', cartId);
  if (error) throw new Error(`Unable to refresh your cart: ${error.message}`);
};

export async function fetchCart(): Promise<Cart> {
  if (!isSupabaseConfigured) return writeLocalCart(readLocalCart());
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Unable to restore your cart session: ${error.message}`);
  if (!data.session) return createLocalCart();
  return loadRemoteCart();
}

export async function addProductToCart(
  product: Product,
  variant: ProductVariant,
): Promise<Cart> {
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocalCart();
    const existing = current.items.find(
      (item) => item.productId === product.id && item.variantId === variant.id,
    );
    const items = existing
      ? current.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: Math.min(item.quantity + 1, 99) } : item,
        )
      : [
          ...current.items,
          {
            id: crypto.randomUUID(),
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName: variant.name,
            image: variant.image,
            unitPrice: product.showPrice ? product.price : null,
            quantity: 1,
          },
        ];
    return writeLocalCart({ ...refreshLocalCart(current), items });
  }

  const cart = await loadRemoteCart();
  const existing = cart.items.find(
    (item) => item.productId === product.id && item.variantId === variant.id,
  );
  const values = {
    cart_id: cart.id,
    product_id: product.id,
    variant_id: variant.id,
    product_name: product.name,
    variant_name: variant.name,
    image_url: variant.image,
    unit_price: product.showPrice ? product.price : null,
    quantity: Math.min((existing?.quantity ?? 0) + 1, 99),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('cart_items')
    .upsert(values, { onConflict: 'cart_id,product_id,variant_id' });
  if (error) throw new Error(`Unable to add this product to your cart: ${error.message}`);
  await touchRemoteCart(cart.id);
  return loadRemoteCart();
}

export async function updateCartItemQuantity(itemId: string, quantity: number): Promise<Cart> {
  const nextQuantity = Math.min(Math.max(Math.round(quantity), 1), 99);
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocalCart();
    return writeLocalCart({
      ...refreshLocalCart(current),
      items: current.items.map((item) =>
        item.id === itemId ? { ...item, quantity: nextQuantity } : item,
      ),
    });
  }

  const cart = await loadRemoteCart();
  const { error } = await supabase
    .from('cart_items')
    .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('cart_id', cart.id);
  if (error) throw new Error(`Unable to update the cart quantity: ${error.message}`);
  await touchRemoteCart(cart.id);
  return loadRemoteCart();
}

export async function removeCartItem(itemId: string): Promise<Cart> {
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocalCart();
    return writeLocalCart({
      ...refreshLocalCart(current),
      items: current.items.filter((item) => item.id !== itemId),
    });
  }

  const cart = await loadRemoteCart();
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', itemId)
    .eq('cart_id', cart.id);
  if (error) throw new Error(`Unable to remove the cart item: ${error.message}`);
  await touchRemoteCart(cart.id);
  return loadRemoteCart();
}

export async function clearCart(): Promise<Cart> {
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocalCart();
    return writeLocalCart({ ...refreshLocalCart(current), items: [] });
  }

  const cart = await loadRemoteCart();
  const { error } = await supabase.from('cart_items').delete().eq('cart_id', cart.id);
  if (error) throw new Error(`Unable to clear your cart: ${error.message}`);
  await touchRemoteCart(cart.id);
  return loadRemoteCart();
}

export async function markCartWhatsAppStarted(): Promise<Cart> {
  if (!isSupabaseConfigured || !supabase) {
    const current = readLocalCart();
    const now = new Date().toISOString();
    return writeLocalCart({
      ...current,
      status: 'whatsapp_started',
      whatsappStartedAt: now,
      updatedAt: now,
    });
  }

  const cart = await loadRemoteCart();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('carts')
    .update({
      status: 'whatsapp_started',
      whatsapp_started_at: now,
      updated_at: now,
      expires_at: new Date(Date.now() + CART_LIFETIME_MS).toISOString(),
    })
    .eq('id', cart.id);
  if (error) throw new Error(`Unable to mark the cart enquiry: ${error.message}`);
  return loadRemoteCart();
}

export async function fetchAdminCarts(): Promise<AdminCart[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('carts')
    .select(CART_COLUMNS)
    .gte('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Unable to load customer carts: ${error.message}`);
  return (data as CartRow[]).map((row) => ({
    ...mapCart(row),
    userId: row.user_id,
    createdAt: row.created_at,
  }));
}
