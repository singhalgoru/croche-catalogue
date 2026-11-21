import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ArtisanPaymentSnapshot from './ArtisanPaymentSnapshot';
import { fetchArtisanPaymentSummary } from '../../services/artisanProfiles';

vi.mock('../../services/artisanProfiles', () => ({ fetchArtisanPaymentSummary: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('shows per-artisan and monthly totals in paise and refreshes the selected month', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockImplementation(async month => month === '2026-10'
    ? [{ artisanId: '1', name: 'Maker A', amount: 125.50, count: 2, latestDate: '2026-10-30' },
      { artisanId: '2', name: 'Maker B', amount: 100.25, count: 1, latestDate: '2026-10-01' }]
    : []);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  fireEvent.change(screen.getByLabelText('Payment month'), { target: { value: '2026-10' } });
  expect(await screen.findByText(/Total paid: ₹225\.75/)).toBeTruthy();
  expect(screen.getByText('Maker A')).toBeTruthy();
  expect(screen.getByText('2 payments · Latest: 30/10/2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  await waitFor(() => expect(fetchArtisanPaymentSummary).toHaveBeenLastCalledWith('2026-10'));
  fireEvent.change(screen.getByLabelText('Payment month'), { target: { value: '2026-09' } });
  expect(await screen.findByText('No payments recorded for this month.')).toBeTruthy();
});

it('reports failures and retries without showing stale totals', async () => {
  vi.mocked(fetchArtisanPaymentSummary).mockRejectedValueOnce(new Error('Payment summary unavailable'))
    .mockResolvedValueOnce([]);
  render(<ArtisanPaymentSnapshot refreshKey={1} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Payment summary unavailable');
  expect(screen.queryByText(/Total paid:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh payments' }));
  expect(await screen.findByText('No payments recorded for this month.')).toBeTruthy();
});
