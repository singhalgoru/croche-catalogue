import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InstallAppButton from './InstallAppButton';

vi.mock('../services/analytics', () => ({ trackEvent: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.setItem('luvia:install-suggestion-shown', 'true');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function eligible() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  act(() => window.dispatchEvent(event));
  return { prompt, event };
}
it('shows one delayed, dismissible suggestion and keeps the manual install button', async () => {
  sessionStorage.removeItem('luvia:install-suggestion-shown');
  const view = render(<InstallAppButton />);
  const { event } = eligible();
  expect(event.defaultPrevented).toBe(true);
  expect(screen.queryByRole('region', { name: 'Install Luvia app' })).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.getByRole('region', { name: 'Install Luvia app' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(screen.getByRole('button', { name: 'Install App' })).toBeTruthy();
  view.unmount();
  render(<InstallAppButton />); eligible();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(screen.queryByRole('region', { name: 'Install Luvia app' })).toBeNull();
});
it('does not offer installation without browser eligibility or in the standalone app', () => {
  const view = render(<InstallAppButton />);
  expect(screen.queryByRole('button')).toBeNull();
  view.unmount();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  render(<InstallAppButton />); eligible();
  expect(screen.queryByRole('button')).toBeNull();
});
it('uses a deferred browser prompt only once and removes installation offers after installation', async () => {
  render(<InstallAppButton />);
  const { prompt } = eligible();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Install App' })));
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button')).toBeNull();
  eligible();
  act(() => window.dispatchEvent(new Event('appinstalled')));
  expect(screen.queryByRole('button')).toBeNull();
});
