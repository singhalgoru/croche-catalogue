import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AllArtisanPayments from './AllArtisanPayments';
import { emptyArtisanDetails, fetchArtisanApplications } from '../../services/artisans';
import { fetchArtisanActivity, recordArtisanPayment } from '../../services/artisanProfiles';

vi.mock('../../services/artisans', async original => ({
  ...await original<typeof import('../../services/artisans')>(), fetchArtisanApplications: vi.fn(),
}));
vi.mock('../../services/artisanProfiles', async original => ({
  ...await original<typeof import('../../services/artisanProfiles')>(),
  fetchArtisanActivity: vi.fn(), recordArtisanPayment: vi.fn(),
}));
const applications = Array.from({ length: 26 }, (_, index) => ({ id: `id-${index}`, details: { ...emptyArtisanDetails, fullName: 'Maker' },
  status: 'Approved' as const, admin_notes: '', version: 1, created_at: '', updated_at: '', consent_version: '', total_paid: 0 }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchArtisanApplications).mockImplementation(async (_search, _status, page) => ({
    applications: applications.slice(page * 25, page * 25 + 25), total: applications.length,
  }));
  vi.mocked(fetchArtisanActivity).mockResolvedValue({ comments: [], payments: [] });
  vi.mocked(recordArtisanPayment).mockResolvedValue(undefined);
});
afterEach(cleanup);
it('validates all unfiltered pages before saving, and retries interrupted uploads with the same IDs', async () => {
  const file = new File([''], 'payments.csv');
  Object.defineProperty(file, 'text', { value: async () => [
    'Artisan,Record ID,Payment Date,Amount,Method,Reference,Work Description,Status',
    'Maker [id-25],,2025-03-31,100,Cash,,Batch,Recorded',
  ].join('\n') });
  vi.mocked(recordArtisanPayment).mockRejectedValueOnce(new Error('Offline'));
  render(<AllArtisanPayments onChanged={vi.fn()} />);
  const input = screen.getByLabelText('Upload all payments CSV');
  fireEvent.change(input, { target: { files: [file] } });
  expect((await screen.findByRole('alert')).textContent).toContain('0 entries confirmed saved');
  expect(fetchArtisanApplications).toHaveBeenCalledWith('', '', 1, '', null);
  expect(fetchArtisanActivity).toHaveBeenCalledTimes(26);
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('Imported 1 new payment across artisans. No money was sent.');
  expect(vi.mocked(recordArtisanPayment).mock.calls[0]).toEqual(vi.mocked(recordArtisanPayment).mock.calls[1]);
  expect(vi.mocked(recordArtisanPayment).mock.calls[1][0]).toBe('id-25');
});
it('does not save any rows if a later artisan history fails to load', async () => {
  vi.mocked(fetchArtisanActivity).mockRejectedValueOnce(new Error('History unavailable'));
  const file = new File([''], 'payments.csv');
  Object.defineProperty(file, 'text', { value: async () => 'Artisan,Record ID,Payment Date,Amount,Method,Reference,Work Description,Status\nMaker [id-0],,2025-03-31,100,Cash,,Batch,Recorded' });
  render(<AllArtisanPayments onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Upload all payments CSV'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('History unavailable'));
  expect(recordArtisanPayment).not.toHaveBeenCalled();
});
