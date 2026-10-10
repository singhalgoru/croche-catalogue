import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AddressBook from './AddressBook';
import { deleteCustomerAddress, fetchCustomerAddresses, saveCustomerAddress } from '../services/customer';
import type { SavedAddress } from '../types/customer';

vi.mock('../services/customer', () => ({
  fetchCustomerAddresses: vi.fn(), saveCustomerAddress: vi.fn(), deleteCustomerAddress: vi.fn(),
}));
const home: SavedAddress = { id: 'home', isDefault: true, details: { name: 'Buyer', phone: '9876543210', email: 'buyer@example.test',
  addressLine1: '12 Home Street', addressLine2: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' } };
const office: SavedAddress = { id: 'office', isDefault: false, details: { ...home.details, addressLine1: '5 Office Park', city: 'Pune',
  state: 'Maharashtra', pincode: '411001' } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchCustomerAddresses).mockResolvedValue([home, office]);
  vi.mocked(saveCustomerAddress).mockResolvedValue('new');
  vi.mocked(deleteCustomerAddress).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('lists saved addresses with the default marked', async () => {
  render(<AddressBook accountEmail="buyer@example.test" />);
  expect(await screen.findAllByRole('listitem', { name: 'Address for Buyer' })).toHaveLength(2);
  expect(screen.getAllByText('Default')).toHaveLength(1);
  expect(screen.getByText(/12 Home Street/)).toBeTruthy();
  expect(screen.getByText(/5 Office Park/)).toBeTruthy();
});

it('adds a new address and refreshes the default', async () => {
  const onDefaultChange = vi.fn();
  render(<AddressBook accountEmail="buyer@example.test" onDefaultChange={onDefaultChange} />);
  fireEvent.click(await screen.findByRole('button', { name: '+ Add new address' }));
  const form = screen.getByRole('form', { name: 'Add address' });
  expect(within(form).getByLabelText('Recipient name')).toHaveProperty('value', 'Buyer');
  fireEvent.change(within(form).getByLabelText('House / building and street'), { target: { value: '9 New Lane' } });
  fireEvent.change(within(form).getByLabelText('City'), { target: { value: 'Jaipur' } });
  fireEvent.change(within(form).getByLabelText('State'), { target: { value: 'Rajasthan' } });
  fireEvent.change(within(form).getByLabelText('Pincode'), { target: { value: '302001' } });
  fireEvent.click(within(form).getByLabelText('Use as my default address'));
  fireEvent.click(within(form).getByRole('button', { name: 'Save address' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Address added.'));
  expect(saveCustomerAddress).toHaveBeenCalledWith(null, expect.objectContaining({ addressLine1: '9 New Lane', email: 'buyer@example.test' }), true);
  expect(onDefaultChange).toHaveBeenCalledWith(home.details);
});

it('edits, makes default and deletes addresses', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<AddressBook accountEmail="buyer@example.test" />);
  const officeItem = (await screen.findAllByRole('listitem'))[1];
  fireEvent.click(within(officeItem).getByRole('button', { name: 'Make default' }));
  await waitFor(() => expect(saveCustomerAddress).toHaveBeenCalledWith('office', office.details, true));
  fireEvent.click(within(screen.getAllByRole('listitem')[1]).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(deleteCustomerAddress).toHaveBeenCalledWith('office'));
  fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: 'Edit' }));
  const form = screen.getByRole('form', { name: 'Edit address' });
  fireEvent.change(within(form).getByLabelText('Area / landmark (optional)'), { target: { value: 'Near park' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save address' }));
  await waitFor(() => expect(saveCustomerAddress).toHaveBeenLastCalledWith('home', expect.objectContaining({ addressLine2: 'Near park' }), true));
});

it('does not offer delete when only one address is saved', async () => {
  vi.mocked(fetchCustomerAddresses).mockResolvedValue([home]);
  render(<AddressBook accountEmail="buyer@example.test" />);
  await screen.findByText(/12 Home Street/);
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});
