import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cartCaptchaSiteKey, finishCartCaptcha, invalidatePreparedCartCaptcha, isCartCaptchaOpen, subscribeCartCaptcha } from '../services/cartCaptcha';
import { loadSupabase } from '../lib/supabaseConfig';

interface Turnstile {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: string;
    size: 'flexible';
    appearance?: 'interaction-only';
    callback: (token: string) => void;
    'error-callback': () => void;
    'expired-callback': () => void;
    'timeout-callback': () => void;
  }) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<Turnstile> | null = null;
const loadTurnstile = (): Promise<Turnstile> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error('Bot verification could not load. Check your connection and retry.'));
    };
    const timer = window.setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    document.head.append(script);
  });
  return loading;
};

function ChallengeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    let api: Turnstile | undefined;
    const failed = () => { if (active) setError('Bot verification failed or expired. Please retry.'); };
    void loadTurnstile().then(turnstile => {
      if (!active || !widgetRef.current) return;
      api = turnstile;
      widgetId = turnstile.render(widgetRef.current, {
        sitekey: cartCaptchaSiteKey, action: 'authentication', size: 'flexible',
        callback: token => { if (active) finishCartCaptcha(token); },
        'error-callback': failed, 'expired-callback': failed, 'timeout-callback': failed,
      });
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Bot verification is unavailable. Please retry.');
    });
    return () => { active = false; if (widgetId && api) api.remove(widgetId); };
  }, [attempt]);
  return <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); finishCartCaptcha(null); }}
    aria-labelledby="cart-captcha-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-cream p-5 text-cocoa backdrop:bg-black/50">
    <h2 id="cart-captcha-title" className="font-heading text-xl font-bold">Quick bot check</h2>
    <p className="my-3 text-sm">Verify to continue. Cloudflare checks your browser to help prevent spam.</p>
    <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer"
      className="mb-3 inline-block text-xs underline">Cloudflare privacy policy</a>
    <div ref={widgetRef} />
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-3 flex gap-3">
      {error && <button type="button" onClick={() => { setError(null); setAttempt(value => value + 1); }}
        className="min-h-11 rounded-full bg-cocoa px-4 text-cream">Retry verification</button>}
      <button type="button" onClick={() => finishCartCaptcha(null)} className="min-h-11 px-3 underline">Cancel</button>
    </div>
  </dialog>;
}

function PreparedChallenge() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    let api: Turnstile | undefined;
    const invalidate = () => { if (active) invalidatePreparedCartCaptcha(); };
    const prepare = async () => {
      const client = await loadSupabase();
      if (client) {
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw new Error(`Unable to prepare cart verification: ${sessionError.message}`);
        if (data.session) return null;
      }
      if (!active) return null;
      return loadTurnstile();
    };
    void prepare().then(turnstile => {
      if (!turnstile) return;
      if (!active || !containerRef.current) return;
      api = turnstile;
      widgetId = api.render(containerRef.current, {
        sitekey: cartCaptchaSiteKey, action: 'authentication', size: 'flexible',
        appearance: 'interaction-only',
        callback: token => { if (active) finishCartCaptcha(token); },
        'expired-callback': invalidate,
        'error-callback': () => {
          invalidate();
          if (active) setError('Bot verification will be retried when you add an item.');
        },
        'timeout-callback': invalidate,
      });
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Bot verification could not load.');
    });
    return () => { active = false; if (widgetId && api) api.remove(widgetId); };
  }, []);
  return <div className="fixed bottom-4 right-4 z-[90] max-w-[calc(100vw-2rem)]">
    <div ref={containerRef} aria-label="Background bot verification" />
    {error && <p role="status" className="rounded-lg bg-cream p-2 text-xs text-cocoa">{error}</p>}
  </div>;
}

export default function CartCaptcha() {
  const open = useSyncExternalStore(subscribeCartCaptcha, isCartCaptchaOpen);
  return open ? <ChallengeDialog /> : cartCaptchaSiteKey ? <PreparedChallenge /> : null;
}
