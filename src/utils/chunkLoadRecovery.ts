const RETRY_KEY = 'vite-preload-retry-at';
const RETRY_WINDOW_MS = 60_000;
let reloadTimer: number | null = null;

export function shouldReloadAfterChunkFailure(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, now: number) {
  const previous = Number(storage.getItem(RETRY_KEY));
  if (Number.isFinite(previous) && previous > 0 && now - previous < RETRY_WINDOW_MS) {
    storage.removeItem(RETRY_KEY);
    return false;
  }
  storage.setItem(RETRY_KEY, String(now));
  return true;
}

export function clearChunkFailureRetry() {
  if (reloadTimer !== null) window.clearTimeout(reloadTimer);
  reloadTimer = null;
  sessionStorage.removeItem(RETRY_KEY);
  const url = new URL(window.location.href);
  if (!url.searchParams.has('_assetRetry')) return;
  url.searchParams.delete('_assetRetry');
  window.history.replaceState(window.history.state, '', url);
}

export function reloadWithFreshAssets() {
  const url = new URL(window.location.href);
  url.searchParams.set('_assetRetry', String(Date.now()));
  window.location.replace(url.href);
}

export function installChunkLoadRecovery(
  target: Window = window,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage,
  reload: () => void = reloadWithFreshAssets,
) {
  const handleFailure = (event: Event) => {
    if (reloadTimer !== null) {
      event.preventDefault();
      return;
    }
    if (!shouldReloadAfterChunkFailure(storage, Date.now())) {
      target.dispatchEvent(new Event('vite:preloadErrorExhausted'));
      return;
    }
    event.preventDefault();
    reloadTimer = target.setTimeout(() => {
      reloadTimer = null;
      reload();
    }, 750);
  };
  target.addEventListener('vite:preloadError', handleFailure);
  return () => target.removeEventListener('vite:preloadError', handleFailure);
}
