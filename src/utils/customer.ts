import type { DeliveryDetails, OrderFulfilment } from '../types/customer';

export const fulfilmentLabels: Record<OrderFulfilment['status'], string> = {
  confirmed: 'Confirmed', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered',
};

export const emptyDeliveryDetails = (): DeliveryDetails => ({
  name: '', phone: '', email: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '',
});
export function normalizeDeliveryDetails(value: DeliveryDetails): DeliveryDetails {
  return {
    name: value.name.trim(), phone: value.phone.trim(), email: value.email.trim().toLowerCase(),
    addressLine1: value.addressLine1.trim(), addressLine2: value.addressLine2.trim(),
    city: value.city.trim(), state: value.state.trim(), pincode: value.pincode.trim(),
  };
}
export function validateDeliveryDetails(value: DeliveryDetails): string | null {
  if (!value.name || value.name.length > 80) return 'Enter a name of up to 80 characters.';
  if (!/^[6-9]\d{9}$/.test(value.phone)) return 'Enter a valid 10-digit Indian mobile number.';
  if (value.email && (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))) return 'Enter a valid email address.';
  if (value.addressLine1.length < 5 || value.addressLine1.length > 200 || value.addressLine2.length > 200) {
    return 'Enter your house/building and street address (5–200 characters).';
  }
  if (!value.city || value.city.length > 80 || !value.state || value.state.length > 80) return 'Enter your city and state.';
  if (!/^[1-9]\d{5}$/.test(value.pincode)) return 'Enter a valid 6-digit Indian pincode.';
  return null;
}
export function deliveryAddressText(value: DeliveryDetails) {
  return [value.addressLine1, value.addressLine2, value.city, value.state, value.pincode, 'India'].filter(Boolean).join(', ');
}
