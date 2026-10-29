import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ArtisanManager from './ArtisanManager';
import { emptyArtisanDetails } from '../../services/artisans';

const { list, history, update, remove, invites, create, revoke } = vi.hoisted(() => ({
  list: vi.fn(), history: vi.fn(), update: vi.fn(), remove: vi.fn(), invites: vi.fn(), create: vi.fn(), revoke: vi.fn(),
}));
vi.mock('../../services/artisans', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/artisans')>(),
  fetchArtisanApplications: list, fetchArtisanHistory: history, updateArtisanApplication: update, deleteArtisanApplication: remove,
  fetchArtisanInvitations: invites, createArtisanInvitation: create, revokeArtisanInvitation: revoke,
}));
const application = { id: 'reference', details: { ...emptyArtisanDetails, fullName: 'Sample Maker', city: 'Gurugram', skills: 'Flowers' },
  status: 'New', admin_notes: '', version: 1, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z', consent_version: '2026-10-29' };
beforeEach(() => {
  vi.clearAllMocks(); list.mockResolvedValue({ applications: [application], total: 1 });
  history.mockResolvedValue([{ id: 1, action: 'Submitted', new_status: 'New', old_status: null, created_at: application.created_at }]);
  invites.mockResolvedValue([]); update.mockResolvedValue({ ...application, version: 2 }); remove.mockResolvedValue(undefined);
  create.mockImplementation(async input => ({ link: `https://luviacreations.com/artisans/#invite=${input.token}`, message: 'Email accepted' }));
});
afterEach(cleanup);
it('filters and searches the directory and saves a versioned review', async () => {
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Name, mobile, skill or location'), { target: { value: 'Flowers' } });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('Flowers', '', 0));
  fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'New' } });
  await waitFor(() => expect(list).toHaveBeenLastCalledWith('Flowers', 'New', 0));
  fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'Contacted' } });
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Paid trial discussed' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(application, 'Contacted', 'Paid trial discussed'));
  expect(await screen.findByText('Application changes saved.')).toBeTruthy();
});
it('preserves review inputs and surfaces a concurrency conflict', async () => {
  update.mockRejectedValue(new Error('Another admin updated this application'));
  render(<ArtisanManager />); fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.change(screen.getByLabelText('Internal review notes'), { target: { value: 'Keep my notes' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Review artisan' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Another admin');
  expect(screen.getByLabelText('Internal review notes')).toHaveProperty('value', 'Keep my notes');
});
it('requires explicit confirmation before permanent deletion', async () => {
  render(<ArtisanManager />); fireEvent.click(await screen.findByRole('button', { name: 'Review Sample Maker' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete application' })); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(application));
});
it('retries the same invitation after email failure without generating a new token', async () => {
  create.mockRejectedValueOnce(new Error('Email provider unavailable'));
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Artisan name'), { target: { value: 'Maker' } });
  fireEvent.change(screen.getByLabelText('Artisan email'), { target: { value: 'maker@example.test' } });
  const form = screen.getByRole('form', { name: 'Invite artisan' });
  fireEvent.submit(form); expect((await screen.findByRole('alert')).textContent).toContain('Email provider unavailable');
  fireEvent.submit(form);
  expect(await screen.findByLabelText('Private application link')).toBeTruthy();
  expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
});
it('creates a WhatsApp deep link but does not claim that a message was sent', async () => {
  render(<ArtisanManager />);
  fireEvent.change(screen.getByLabelText('Artisan name'), { target: { value: 'Maker' } });
  fireEvent.change(screen.getByLabelText('Send using'), { target: { value: 'whatsapp' } });
  fireEvent.change(screen.getByLabelText('Artisan WhatsApp number'), { target: { value: '9876543210' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Invite artisan' }));
  const link = await screen.findByRole('link', { name: 'Open WhatsApp to send' });
  expect(link.getAttribute('href')).toContain('https://wa.me/919876543210?text=');
  expect(create.mock.calls[0][0].channel).toBe('whatsapp');
});
