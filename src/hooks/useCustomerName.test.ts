import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { customerDisplayName, useCustomerName } from './useCustomerName';
import { fetchCustomerIdentity, fetchCustomerProfile } from '../services/customer';

vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => null }));
vi.mock('../services/customer', () => ({ fetchCustomerIdentity: vi.fn(), fetchCustomerProfile: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('uses the profile first name, falling back to the email name', () => {
  expect(customerDisplayName('  Asha  Verma ', 'asha@example.test')).toBe('Asha');
  expect(customerDisplayName(undefined, 'buyer.one@example.test')).toBe('buyer.one');
});
it('returns the verified customer name and nothing for guests', async () => {
  vi.mocked(fetchCustomerIdentity).mockResolvedValue({ email: 'asha@example.test' });
  vi.mocked(fetchCustomerProfile).mockResolvedValue({ name: 'Asha Verma', phone: '', email: '', addressLine1: '',
    addressLine2: '', city: '', state: '', pincode: '' });
  const { result } = renderHook(() => useCustomerName());
  await waitFor(() => expect(result.current).toBe('Asha'));
  vi.mocked(fetchCustomerIdentity).mockResolvedValue(null);
  const guest = renderHook(() => useCustomerName());
  await waitFor(() => expect(fetchCustomerIdentity).toHaveBeenCalledTimes(2));
  expect(guest.result.current).toBeNull();
});
it('uses the latest account name instead of the email or delivery recipient', async () => {
  vi.mocked(fetchCustomerIdentity).mockResolvedValue({ email: 'owner@example.test', name: 'Gourav S' });
  const { result } = renderHook(() => useCustomerName());
  await waitFor(() => expect(result.current).toBe('Gourav'));
  expect(fetchCustomerProfile).not.toHaveBeenCalled();
});
it.each(['admin-account-updated', 'focus'])('refreshes an existing greeting on %s', async event => {
  vi.mocked(fetchCustomerIdentity).mockResolvedValue({ email: 'owner@example.test' });
  vi.mocked(fetchCustomerProfile).mockResolvedValue(null);
  const { result } = renderHook(() => useCustomerName());
  await waitFor(() => expect(result.current).toBe('owner'));
  vi.mocked(fetchCustomerIdentity).mockResolvedValue({ email: 'owner@example.test', name: 'Updated Admin' });
  act(() => { window.dispatchEvent(new Event(event)); });
  await waitFor(() => expect(result.current).toBe('Updated'));
});
