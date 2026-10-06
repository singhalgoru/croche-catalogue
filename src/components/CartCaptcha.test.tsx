import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
const { default: CartCaptcha } = await import('./CartCaptcha');
const { finishCartCaptcha, requestCartCaptcha } = await import('../services/cartCaptcha');
type Options = Parameters<NonNullable<Window['turnstile']>['render']>[1];
let options: Options;
const remove = vi.fn();
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
});
afterEach(() => {
  finishCartCaptcha(null);
  cleanup();
  delete window.turnstile;
  vi.clearAllMocks();
});
const installWidget = () => {
  window.turnstile = { render: vi.fn((_container, value) => { options = value; return 'widget'; }), remove };
};

it('opens only on demand, coalesces requests and removes the widget after success', async () => {
  installWidget();
  render(<CartCaptcha />);
  expect(screen.queryByText('Quick bot check')).toBeNull();
  let pending!: ReturnType<typeof requestCartCaptcha>;
  act(() => { pending = requestCartCaptcha(); });
  expect(requestCartCaptcha()).toBe(pending);
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledOnce());
  expect(options.sitekey).toBe('test-site-key');
  act(() => options.callback('verified-token'));
  expect(await pending).toBe('verified-token');
  expect(screen.queryByText('Quick bot check')).toBeNull();
  expect(remove).toHaveBeenCalledWith('widget');
});

it('reports expiry and supports retry without accepting an invalid token', async () => {
  installWidget();
  render(<CartCaptcha />);
  let pending!: ReturnType<typeof requestCartCaptcha>;
  act(() => { pending = requestCartCaptcha(); });
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledOnce());
  act(() => options['expired-callback']());
  expect(screen.getByRole('alert').textContent).toContain('expired');
  fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(2));
  act(() => options.callback('retry-token'));
  expect(await pending).toBe('retry-token');
});

it('allows cancellation and a new verification attempt', async () => {
  installWidget();
  render(<CartCaptcha />);
  let pending!: ReturnType<typeof requestCartCaptcha>;
  act(() => { pending = requestCartCaptcha(); });
  const rejected = expect(pending).rejects.toThrow('cancelled');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await rejected;
  act(() => { pending = requestCartCaptcha(); });
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
  act(() => options.callback('new-token'));
  expect(await pending).toBe('new-token');
});

it('surfaces script load failures instead of allowing an unverified signup', async () => {
  render(<CartCaptcha />);
  let pending!: ReturnType<typeof requestCartCaptcha>;
  act(() => { pending = requestCartCaptcha(); });
  const script = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')!;
  fireEvent.error(script);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not load'));
  const rejected = expect(pending).rejects.toThrow('cancelled');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await rejected;
});
