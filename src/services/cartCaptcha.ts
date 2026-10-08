export const cartCaptchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';

interface Challenge {
  promise: Promise<string>;
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}
let challenge: Challenge | null = null;
let preparedToken: { token: string; expiresAt: number } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export const subscribeCartCaptcha = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isCartCaptchaOpen = () => challenge !== null;
export const invalidatePreparedCartCaptcha = () => { preparedToken = null; };

export const requestCartCaptcha = (): Promise<string | undefined> => {
  if (!cartCaptchaSiteKey) return Promise.resolve(undefined);
  if (challenge) return challenge.promise;
  if (preparedToken && preparedToken.expiresAt > Date.now()) {
    const token = preparedToken.token;
    preparedToken = null;
    return Promise.resolve(token);
  }
  preparedToken = null;
  let resolve!: Challenge['resolve'];
  let reject!: Challenge['reject'];
  const promise = new Promise<string>((onSuccess, onError) => { resolve = onSuccess; reject = onError; });
  challenge = { promise, resolve, reject };
  notify();
  return promise;
};

export const finishCartCaptcha = (token: string | null) => {
  const pending = challenge;
  preparedToken = null;
  if (!pending) {
    // Turnstile tokens last five minutes; leave a margin for the signup request.
    if (token) preparedToken = { token, expiresAt: Date.now() + 4 * 60 * 1000 };
    return;
  }
  challenge = null;
  notify();
  if (token) pending.resolve(token);
  else pending.reject(new Error('Bot verification cancelled. Please try again.'));
};
