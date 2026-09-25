import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Header from '../Header';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { fetchCategorySettings } from '../../services/categories';
import type { CategorySettings } from '../../types/product';
import AdminLogin from './AdminLogin';
import CategoryManager from './CategoryManager';
import CartManager from './CartManager';
import ProductManager from './ProductManager';
import ProductUploadForm from './ProductUploadForm';

const ADMIN_MANIFEST_HREF = `${import.meta.env.BASE_URL}admin-manifest.webmanifest`;

interface Props {
  onProductPublished: () => Promise<void>;
}

export default function AdminPage({ onProductPublished }: Props) {
  // The customer shop manifest is linked by default (see vite.config.ts) so
  // it can be installed as its own app. While the admin console is open,
  // swap that link to admin-manifest.webmanifest so installing from #admin
  // creates a separate "Luvia Admin" app instead, then restore it on exit.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousHref = link?.getAttribute('href') ?? null;
    if (link) link.setAttribute('href', ADMIN_MANIFEST_HREF);
    return () => {
      if (link && previousHref) link.setAttribute('href', previousHref);
    };
  }, []);

  const [productRefreshKey, setProductRefreshKey] = useState(0);
  const [categorySettings, setCategorySettings] = useState<CategorySettings[]>([]);
  const categories = categorySettings.map((category) => category.name);
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(isSupabaseConfigured);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(`Unable to restore the admin session: ${error.message}`);
      setSession(data.session);
      setIsCheckingSession(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setIsAdmin(null);
      setSession(nextSession);
      setIsCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;

    let isCurrent = true;
    void supabase.rpc('is_catalogue_admin').then(({ data, error }) => {
      if (!isCurrent) return;
      if (error) {
        setAuthError(`Unable to verify catalogue access: ${error.message}`);
        setIsAdmin(false);
        return;
      }
      setAuthError(null);
      setIsAdmin(data === true);
    });

    return () => {
      isCurrent = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isAdmin) return;

    void fetchCategorySettings().then(
      (nextCategories) => setCategorySettings(nextCategories),
      (error: unknown) =>
        setAuthError(error instanceof Error ? error.message : 'Unable to load categories.'),
    );
  }, [isAdmin]);

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-cream px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-mustard/40 bg-white p-6 shadow-lg">
          <h1 className="font-heading text-3xl font-bold text-cocoa">Admin setup required</h1>
          <p className="mt-3 text-cocoa/75">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to
            your environment, then rebuild the site.
          </p>
          <a href="./" className="mt-5 inline-block font-semibold text-cocoa underline">
            Back to catalogue
          </a>
        </div>
      </main>
    );
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-cocoa">
        Checking admin session…
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(`Unable to sign out: ${error.message}`);
  };

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream text-cocoa">
        Verifying catalogue access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-cream px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-lg">
          <h1 className="font-heading text-3xl font-bold text-cocoa">Access not authorized</h1>
          <p className="mt-3 text-cocoa/75">
            This account is signed in but is not listed in the Supabase{' '}
            <code>catalogue_admins</code> table.
          </p>
          {authError && <p className="mt-3 text-sm text-red-700">{authError}</p>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-5 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  const handleProductChanged = async () => {
    await onProductPublished();
    setProductRefreshKey((current) => current + 1);
  };

  const handleCategoryChanged = async () => {
    const nextCategories = await fetchCategorySettings();
    setCategorySettings(nextCategories);
    await onProductPublished();
    setProductRefreshKey((current) => current + 1);
  };

  return (
    <div className="min-h-screen bg-cream">
      <Header showShippingTicker={false} showInstallPrompt={false} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-heading text-sm font-semibold uppercase tracking-widest text-mustard-dark">
              Catalogue admin
            </p>
            <h1 className="font-heading text-3xl font-bold text-cocoa">Manage catalogue</h1>
            <p className="mt-1 text-sm text-cocoa/65">{session.user.email}</p>
          </div>
          <div className="flex gap-3">
            <a
              href="./"
              className="rounded-full border-2 border-mustard px-4 py-2 text-sm font-semibold text-cocoa"
            >
              View catalogue
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-cream"
            >
              Sign out
            </button>
          </div>
        </div>

        {authError && (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {authError}
          </p>
        )}

        <CategoryManager categories={categorySettings} onChanged={handleCategoryChanged} />
        <CartManager />
        <ProductUploadForm categories={categories} onPublished={handleProductChanged} />
        <ProductManager
          categories={categories}
          refreshKey={productRefreshKey}
          onChanged={handleProductChanged}
        />
      </main>
    </div>
  );
}
