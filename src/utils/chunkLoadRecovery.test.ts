import { afterEach, expect, it, vi } from 'vitest';
import { clearChunkFailureRetry, installChunkLoadRecovery, shouldReloadAfterChunkFailure } from './chunkLoadRecovery';

const KEY = 'vite-preload-retry-at';
afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

it('allows one cache-busting reload for a failed chunk, but prevents a reload loop', () => {
  expect(shouldReloadAfterChunkFailure(sessionStorage, 100_000)).toBe(true);
  expect(sessionStorage.getItem(KEY)).toBe('100000');
  expect(shouldReloadAfterChunkFailure(sessionStorage, 101_000)).toBe(false);
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('allows a later reload after the retry window expires', () => {
  sessionStorage.setItem(KEY, '100000');
  expect(shouldReloadAfterChunkFailure(sessionStorage, 161_000)).toBe(true);
});

it('clears recovery state and the temporary cache-busting query after success', () => {
  sessionStorage.setItem(KEY, '100000');
  history.replaceState(null, '', '/p/watermelon/?_assetRetry=101000&variant=red#making-video');
  clearChunkFailureRetry();
  expect(sessionStorage.getItem(KEY)).toBeNull();
  expect(location.href).toBe(`${location.origin}/p/watermelon/?variant=red#making-video`);
});

it('reloads once on a Vite chunk error and exposes a recovery event instead of looping', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  const reload = vi.fn();
  const exhausted = vi.fn();
  const off = installChunkLoadRecovery(window, sessionStorage, reload);
  window.addEventListener('vite:preloadErrorExhausted', exhausted);
  const first = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(first);
  expect(first.defaultPrevented).toBe(true);
  const repeated = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(repeated);
  expect(repeated.defaultPrevented).toBe(true);
  expect(reload).not.toHaveBeenCalled();
  expect(exhausted).not.toHaveBeenCalled();
  vi.advanceTimersByTime(750);
  expect(reload).toHaveBeenCalledOnce();
  off();
  const offRetry = installChunkLoadRecovery(window, sessionStorage, reload);
  const exhaustedRetry = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(exhaustedRetry);
  expect(exhaustedRetry.defaultPrevented).toBe(false);
  expect(exhausted).toHaveBeenCalledOnce();
  offRetry();
  window.removeEventListener('vite:preloadErrorExhausted', exhausted);
});

it('cancels the pending reload when the retrying chunk import succeeds', () => {
  vi.useFakeTimers();
  const reload = vi.fn();
  const off = installChunkLoadRecovery(window, sessionStorage, reload);
  window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
  clearChunkFailureRetry();
  vi.advanceTimersByTime(1000);
  expect(reload).not.toHaveBeenCalled();
  off();
});
