import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { customerDisplayName, useCustomerName } from './useCustomerName';
import { fetchCustomerAccount, fetchCustomerProfile } from '../services/customer';

vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => null }));
vi.mock('../services/customer', () => ({ fetchCustomerAccount: vi.fn(), fetchCustomerProfile: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('uses the profile first name, falling back to the email name', () => {
  expect(customerDisplayName('  Asha  Verma ', 'asha@example.test')).toBe('Asha');
  expect(customerDisplayName(undefined, 'buyer.one@example.test')).toBe('buyer.one');
});
it('returns the verified customer name and nothing for guests', async () => {
  vi.mocked(fetchCustomerAccount).mockResolvedValue('asha@example.test');
  vi.mocked(fetchCustomerProfile).mockResolvedValue({ name: 'Asha Verma', phone: '', email: '', addressLine1: '',
    addressLine2: '', city: '', state: '', pincode: '' });
  const { result } = renderHook(() => useCustomerName());
  await waitFor(() => expect(result.current).toBe('Asha'));
  vi.mocked(fetchCustomerAccount).mockResolvedValue(null);
  const guest = renderHook(() => useCustomerName());
  await waitFor(() => expect(fetchCustomerAccount).toHaveBeenCalledTimes(2));
  expect(guest.result.current).toBeNull();
});
