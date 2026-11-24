import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DtdcSandbox from './DtdcSandbox';
import { bookDtdcTest, clearDtdcTest, listDtdcTests, trackDtdcTest } from '../../services/dtdcSandbox';

vi.mock('../../services/dtdcSandbox', () => ({
  bookDtdcTest: vi.fn(), clearDtdcTest: vi.fn(), labelDtdcTest: vi.fn(), listDtdcTests: vi.fn(), trackDtdcTest: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const open = () => fireEvent.click(screen.getByText('DTDC sandbox tests'));

it('requires confirmation before creating a synthetic booking', async () => {
  vi.mocked(listDtdcTests).mockResolvedValue([]);
  vi.mocked(bookDtdcTest).mockResolvedValue();
  render(<DtdcSandbox />);
  open();
  await screen.findByText('No DTDC test bookings yet.');
  const button = screen.getByRole('button', { name: 'Create test booking' });
  expect(button).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('checkbox', { name: /synthetic test shipment/ }));
  fireEvent.click(button);
  await waitFor(() => expect(bookDtdcTest).toHaveBeenCalledOnce());
  expect((await screen.findByRole('status')).textContent).toContain('not a customer order');
});

it('blocks new bookings and requires explicit reconciliation for uncertain results', async () => {
  vi.mocked(listDtdcTests).mockResolvedValue([{ id: 'test-id', customer_reference: 'test-ref',
    state: 'review', awb: null, created_at: '2026-01-01T00:00:00Z' }]);
  vi.mocked(clearDtdcTest).mockResolvedValue();
  render(<DtdcSandbox />);
  open();
  await screen.findByText('Reference: test-ref');
  expect(screen.getByRole('button', { name: 'Create test booking' })).toHaveProperty('disabled', true);
  const clear = screen.getByRole('button', { name: 'Clear reconciled test' });
  expect(clear).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('checkbox', { name: /checked DTDC/ }));
  fireEvent.click(clear);
  await waitFor(() => expect(clearDtdcTest).toHaveBeenCalledWith('test-id'));
});

it('shows provider errors and tracking status', async () => {
  vi.mocked(listDtdcTests).mockResolvedValue([{ id: 'test-id', customer_reference: 'test-ref',
    state: 'booked', awb: 'AWB123', created_at: '2026-01-01T00:00:00Z' }]);
  vi.mocked(trackDtdcTest).mockRejectedValueOnce(new Error('Tracking unavailable')).mockResolvedValueOnce('Booked');
  render(<DtdcSandbox />);
  open();
  const track = await screen.findByRole('button', { name: 'Track test shipment' });
  fireEvent.click(track);
  expect((await screen.findByRole('alert')).textContent).toContain('Tracking unavailable');
  fireEvent.click(track);
  expect((await screen.findByRole('status')).textContent).toContain('Booked');
});
