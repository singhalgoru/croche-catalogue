import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Header from '../Header';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import AdminLogin from './AdminLogin';
import ProductManager from './ProductManager';
import ProductUploadForm from './ProductUploadForm';

interface Props {
  onProductPublished: () => Promise<void>;
}

export default function AdminPage({ onProductPublished }: Props) {
  const [productRefreshKey, setProductRefreshKey] = useState(0);
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

  return (
    <div className="min-h-screen bg-cream">
      <Header />
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

        <ProductUploadForm onPublished={handleProductChanged} />
        <ProductManager refreshKey={productRefreshKey} onChanged={handleProductChanged} />
      </main>
    </div>
  );
}
