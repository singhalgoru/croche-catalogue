import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ArtisanWorkAcceptance from './ArtisanWorkAcceptance';
import { acceptWorkAssignment, readWorkAssignment } from '../services/artisanWork';

vi.mock('../services/artisanWork', () => ({ acceptWorkAssignment: vi.fn(), readWorkAssignment: vi.fn() }));
const offer = { recipientName: 'Maker', reference: '00000000-0000-4000-8000-000000000001', subject: 'Work offer',
  message: 'Please review.', deliveryDate: '2099-12-01', courierCap: 100,
  items: [{ name: 'Headband', quantity: 2, rateWithYarn: 150, rateWithoutYarn: 100, patternFilename: 'Headband.pdf' }] };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows terms without accepting on page load and explicitly accepts once confirmed', async () => {
  const token = 'a'.repeat(64);
  history.replaceState(null, '', `/artisans/#work=${token}`);
  vi.mocked(readWorkAssignment).mockResolvedValue({ offer, acceptedAt: null, completedAt: null, expiresAt: '2099-12-01T00:00:00Z' });
  vi.mocked(acceptWorkAssignment).mockResolvedValue();
  render(<ArtisanWorkAcceptance />);
  expect(await screen.findByText('Headband', { selector: 'strong' })).toBeTruthy();
  expect(acceptWorkAssignment).not.toHaveBeenCalled();
  expect(screen.getByText(/Maximum courier reimbursement/).textContent).toContain('100.00');
  fireEvent.click(screen.getByRole('checkbox', { name: /I accept/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept assignment' }));
  await screen.findByText(/Work is in progress/);
  expect(acceptWorkAssignment).toHaveBeenCalledWith(token);
});
it('reports an acceptance error without claiming success and allows retry', async () => {
  history.replaceState(null, '', `/artisans/#work=${'b'.repeat(64)}`);
  vi.mocked(readWorkAssignment).mockResolvedValue({ offer, acceptedAt: null, completedAt: null, expiresAt: '2099-12-01T00:00:00Z' });
  vi.mocked(acceptWorkAssignment).mockRejectedValue(new Error('Link expired'));
  render(<ArtisanWorkAcceptance />);
  fireEvent.click(await screen.findByRole('checkbox', { name: /I accept/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept assignment' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Link expired'));
  expect(screen.queryByText(/Work is in progress/)).toBeNull();
});
