import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanApplicationForm from './ArtisanApplicationForm';
import content from '../content/artisanOnboarding.json';

const { check, submit } = vi.hoisted(() => ({ check: vi.fn(), submit: vi.fn() }));
vi.mock('../services/artisans', async importOriginal => ({
  ...await importOriginal<typeof import('../services/artisans')>(), checkArtisanInvitation: check, submitArtisanApplication: submit,
}));
const token = 'a'.repeat(64);
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState(null, '', `/artisans/#invite=${token}`);
  check.mockResolvedValue('available'); submit.mockResolvedValue('saved-reference');
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('requires a valid invitation and displays no application for unavailable links', async () => {
  window.history.replaceState(null, '', '/artisans/');
  render(<ArtisanApplicationForm />);
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Applications are by invitation');
  expect(check).not.toHaveBeenCalled();
});
it.each(['unavailable', 'submitted'])('does not expose the form for %s invitations', async status => {
  check.mockResolvedValue(status); render(<ArtisanApplicationForm />);
  await waitFor(() => expect(screen.queryByText('Checking your invitation...')).toBeNull());
  expect(screen.queryByRole('form')).toBeNull();
});
it('offers a retry instead of treating invitation check failures as valid', async () => {
  check.mockRejectedValueOnce(new Error('Offline')); render(<ArtisanApplicationForm />);
  expect((await screen.findByRole('alert')).textContent).toBe('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry invitation check' }));
  expect(await screen.findByRole('form')).toBeTruthy();
});
it('checks a new invitation when only the URL fragment changes', async () => {
  window.history.replaceState(null, '', '/artisans/');
  render(<ArtisanApplicationForm />);
  window.history.replaceState(null, '', `/artisans/#invite=${token}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
  expect(await screen.findByRole('form', { name: 'Artisan application' })).toBeTruthy();
  expect(check).toHaveBeenCalledWith(token);
});
it('preserves details and request ID on a failed submission, then confirms persistence and clears the token', async () => {
  submit.mockRejectedValueOnce(new Error('Connection interrupted'));
  render(<ArtisanApplicationForm />);
  const form = await screen.findByRole('form', { name: 'Artisan application' });
  for (const field of content.fields.filter(item => item.required)) {
    fireEvent.change(screen.getByLabelText(new RegExp(field.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), { target: { value: `Sample ${field.name}` } });
  }
  fireEvent.click(screen.getByLabelText(/I confirm I am 18/));
  fireEvent.click(screen.getByLabelText(/I confirm my details are accurate/));
  fireEvent.submit(form);
  expect((await screen.findByRole('alert')).textContent).toBe('Connection interrupted');
  expect(screen.getByLabelText(/Full name/)).toHaveProperty('value', 'Sample fullName');
  fireEvent.submit(form);
  expect((await screen.findByRole('status')).textContent).toContain('saved-reference');
  expect(submit.mock.calls[0][1]).toBe(submit.mock.calls[1][1]);
  expect(submit.mock.calls[0][2]).toBe(token);
  expect(window.location.hash).toBe('');
  expect(screen.queryByRole('form')).toBeNull();
  expect(localStorage.getItem('artisan-application')).toBeNull();
});
