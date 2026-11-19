import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ArtisanPaymentForm from './ArtisanPaymentForm';
import { submitPaymentDetails } from '../services/artisanPaymentDetails';

vi.mock('../services/artisanPaymentDetails',async importOriginal => ({
  ...await importOriginal<typeof import('../services/artisanPaymentDetails')>(),submitPaymentDetails: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('requires consent and submits the selected payment method through the private link',async () => {
  const token = 'a'.repeat(64);
  history.replaceState(null,'',`/artisans/#payment=${token}`);
  vi.mocked(submitPaymentDetails).mockResolvedValueOnce();
  render(<ArtisanPaymentForm />);
  fireEvent.change(screen.getByLabelText('Account holder name'),{ target: { value: 'Sample Maker' } });
  fireEvent.change(screen.getByLabelText('Payment method'),{ target: { value: 'Bank transfer' } });
  fireEvent.change(screen.getByLabelText('Bank account number'),{ target: { value: '1234567890' } });
  fireEvent.change(screen.getByLabelText('IFSC'),{ target: { value: 'ABCD0123456' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{ name: 'Submit payment details' }));
  await screen.findByText(/submitted for review/);
  expect(submitPaymentDetails).toHaveBeenCalledWith(token,expect.objectContaining({
    name: 'Sample Maker',method: 'Bank transfer',account: '1234567890',ifsc: 'ABCD0123456',
  }));
  expect(location.hash).toBe('');
});

it('reports submission failure without claiming success',async () => {
  history.replaceState(null,'',`/artisans/#payment=${'b'.repeat(64)}`);
  vi.mocked(submitPaymentDetails).mockRejectedValueOnce(new Error('Payment link expired'));
  render(<ArtisanPaymentForm />);
  fireEvent.change(screen.getByLabelText('Account holder name'),{ target: { value: 'Sample Maker' } });
  fireEvent.change(screen.getByLabelText('UPI ID'),{ target: { value: 'maker@bank' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{ name: 'Submit payment details' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Payment link expired'));
  expect(screen.queryByText(/submitted for review/)).toBeNull();
});
