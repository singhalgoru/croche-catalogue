import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerFunnel from './CustomerFunnel';
import type { Cart } from '../types/cart';
import { emptyDeliveryDetails, normalizeDeliveryDetails, validateDeliveryDetails } from '../utils/customer';
import { buildWhatsAppCartMessage, buildEmailCartBody } from '../utils/cartMessage';
import { fetchCustomerProfile } from '../services/customer';
vi.mock('../services/customer', () => ({ fetchCustomerProfile: vi.fn() }));
const cart: Cart = { id: 'cart', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '',
  whatsappStartedAt: null, items: [] };
const details = { name: 'Test Buyer', phone: '9876543210', email: 'buyer@example.test',
  addressLine1: '12 Test Street', addressLine2: '', city: 'New Delhi', state: 'Delhi', pincode: '110001' };
afterEach(cleanup);
beforeEach(() => { vi.mocked(fetchCustomerProfile).mockReset().mockResolvedValue(null); });
async function enterAddress() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue with delivery details' }));
  fireEvent.change(await screen.findByLabelText('Recipient name'), { target: { value: details.name } });
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: details.phone } });
  fireEvent.change(screen.getByLabelText('Contact email (optional)'), { target: { value: details.email } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to address' }));
  for (const [label, value] of [['House / building and street', details.addressLine1],
    ['City', details.city], ['State', details.state], ['Pincode', details.pincode]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
it('supports guest contact → address → persisted review without requiring signup', async () => {
  const save = vi.fn().mockResolvedValue({ ...cart, deliveryDetails: details });
  render(<CustomerFunnel cart={cart} busy={false} onSave={save} onCoupon={vi.fn()} />);
  await enterAddress();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() => expect(screen.getByText('3. Review order request')).toBeTruthy());
  expect(save).toHaveBeenCalledWith(details);
  expect(screen.queryByRole('form', { name: 'Customer signup' })).toBeNull();
  expect(screen.getByText(/12 Test Street/)).toBeTruthy();
});
it('keeps the address form open on persistence failure', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Unable to save address.'));
  render(<CustomerFunnel cart={cart} busy={false} onSave={save} onCoupon={vi.fn()} />);
  await enterAddress();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unable to save'));
  expect(screen.getByText('2. Delivery address')).toBeTruthy();
});
it('restores saved details and allows editing them', () => {
  render(<CustomerFunnel cart={{ ...cart, deliveryDetails: details }} busy={false} onSave={vi.fn()} onCoupon={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review delivery details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(screen.getByDisplayValue(details.name)).toBeTruthy();
});
it('normalizes and validates required contact and address fields', () => {
  expect(normalizeDeliveryDetails({ ...details, name: ' Buyer ', email: ' BUYER@EXAMPLE.TEST ' }))
    .toMatchObject({ name: 'Buyer', email: 'buyer@example.test' });
  expect(validateDeliveryDetails(details)).toBeNull();
  expect(validateDeliveryDetails(emptyDeliveryDetails())).toContain('name');
  for (const invalid of [{ phone: '123' }, { email: 'invalid' }, { pincode: '000000' },
    { addressLine1: 'a' }, { city: '' }, { state: '' }]) expect(validateDeliveryDetails({ ...details, ...invalid })).not.toBeNull();
});
it('includes saved details and requested coupon in both enquiry channels without silently discounting totals', () => {
  const order = { ...cart, deliveryDetails: details, deliveryPinCode: details.pincode, welcomeCouponCode: 'WELCOME-TEST' };
  for (const message of [buildWhatsAppCartMessage(order), buildEmailCartBody(order)]) {
    expect(message).toContain(details.name);
    expect(message).toContain(details.phone);
    expect(message).toContain(details.addressLine1);
    expect(message).toContain('WELCOME-TEST');
    expect(message).toContain('please confirm eligibility and discount');
  }
});

it('submits a typed coupon and surfaces server eligibility errors', async () => {
  const select = vi.fn().mockRejectedValue(new Error('Verify your email before using ILOVELUVIA.'));
  render(<CustomerFunnel cart={{ ...cart, deliveryDetails: details }} busy={false} onSave={vi.fn()} onCoupon={select} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review delivery details' }));
  fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'iloveluvia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply coupon to request' }));
  await waitFor(() => expect(select).toHaveBeenCalledWith('ILOVELUVIA'));
  expect(screen.getByRole('alert').textContent).toContain('Verify your email');
});

it('goes straight to delivery details with a guest reward note and prefills a signed-in profile', async () => {
  vi.mocked(fetchCustomerProfile).mockResolvedValue({ name: 'Saved Buyer', phone: '9123456780', email: 'saved@example.test',
    addressLine1: '9 Saved Road', addressLine2: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' });
  render(<CustomerFunnel cart={{ ...cart, deliveryPinCode: '411002' }} busy={false} onSave={vi.fn()} onCoupon={vi.fn()} />);
  expect(screen.getByText(/Guest orders do not receive the one-time welcome reward/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with delivery details' }));
  expect(await screen.findByDisplayValue('Saved Buyer')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to address' }));
  expect(screen.getByDisplayValue('9 Saved Road')).toBeTruthy();
  expect(screen.getByDisplayValue('411002')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('button', { name: 'Continue with delivery details' })).toBeTruthy();
});