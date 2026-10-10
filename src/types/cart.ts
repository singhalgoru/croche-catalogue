import type { DeliveryDetails } from './customer';

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  productSlug?: string;
  variantName: string;
  image: string;
  unitPrice: number | null;
  quantity: number;
}

export interface DeliveryEstimate {
  provider: 'shiprocket';
  currency: 'INR';
  minCharge: number;
  maxCharge: number;
  minDays: number | null;
  maxDays: number | null;
  weightGrams: number;
  /** Total cart quantity the estimate was calculated for. */
  itemCount: number;
  checkedAt: string;
}

export interface Cart {
  deliveryDetails?: DeliveryDetails | null;
  welcomeCouponCode?: string | null;
  deliveryPinCode?: string | null;
  deliveryPinLocation?: { districts: string[]; states: string[]; country: 'India' } | null;
  deliveryPinCheckedAt?: string | null;
  deliveryEstimate?: DeliveryEstimate | null;
  id: string;
  reference: string;
  status: 'active' | 'whatsapp_started';
  updatedAt: string;
  expiresAt: string;
  whatsappStartedAt: string | null;
  items: CartItem[];
}

export interface AdminCart extends Cart {
  userId: string;
  createdAt: string;
  networkDetails?: {
    ipAddress: string;
    capturedAt: string;
    location?: {
      city: string | null; region: string | null;
      country: string | null; countryCode: string | null; provider: 'geolite2';
    } | null;
  } | null;
}

export interface CartSessionBlock {
  userId: string;
  createdAt: string;
}
