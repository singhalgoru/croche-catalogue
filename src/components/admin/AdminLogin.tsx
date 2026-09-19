import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setIsSigningIn(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSigningIn(false);

    if (error) {
      setErrorMessage(`Unable to sign in: ${error.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-cream px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-mustard/40 bg-white p-6 shadow-lg sm:p-8">
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-mustard-dark">
          Luvia Admin
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold text-cocoa">Manage catalogue</h1>
        <p className="mt-2 text-sm text-cocoa/70">
          Sign in with the admin account created in Supabase.
        </p>

        <form className="mt-6 space-y-4" onSubmit={signIn}>
          <label className="block text-sm font-semibold text-cocoa">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2 outline-none focus:border-cocoa"
            />
          </label>
          <label className="block text-sm font-semibold text-cocoa">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2 outline-none focus:border-cocoa"
            />
          </label>

          {errorMessage && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full rounded-full bg-cocoa py-2.5 font-semibold text-cream transition-colors hover:bg-cocoa-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <a href="./" className="mt-5 block text-center text-sm font-semibold text-cocoa underline">
          Back to catalogue
        </a>
      </div>
    </main>
  );
}
