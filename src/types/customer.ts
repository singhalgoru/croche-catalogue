export interface DeliveryDetails {
  name: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}
export interface SavedAddress {
  id: string;
  details: DeliveryDetails;
  isDefault: boolean;
}
export interface WelcomeOffer {
  enabled: boolean;
  percent: number;
  maxDiscountRupees: number;
  minimumSubtotalRupees: number;
  validDays: number;
}
export interface WelcomeCoupon {
  code: string;
  expires_at: string;
  percent: number;
  max_discount_rupees: number;
  minimum_subtotal_rupees: number;
  email_sent_at: string | null;
}
export interface CampaignCoupon {
  id: string;
  code: string;
  percent: number;
  max_discount_rupees: number;
  minimum_subtotal_rupees: number;
  max_redemptions: number;
  first_order_only: boolean;
  enabled: boolean;
  expires_at: string;
}
export interface OrderFulfilment {
  status: 'confirmed' | 'processing' | 'shipped' | 'delivered';
  courierName: string;
  trackingNumber: string;
  trackingUrl: string;
  updatedAt: string | null;
}
export interface CustomerOrder {
  fulfilment?: OrderFulfilment | null;
  expiresAt?: string;
  id: string;
  reference: string;
  status: 'creating_link' | 'link_created' | 'link_failed' | 'paid' | 'expired' | 'cancelled' | 'review_required';
  createdAt: string;
  paidAt: string | null;
  customerName: string;
  deliveryPincode: string | null;
  deliveryDetails?: DeliveryDetails | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  items: { id: string; productName: string; variantName: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

export interface AdminCustomerSummary {
  total: number;
  verified: number;
  pendingActivation: number;
  welcomeEmailsSent: number;
  customers: {
    id: string;
    email: string;
    name: string;
    phone: string;
    city: string;
    pincode: string;
    registeredAt: string;
    lastSignInAt: string | null;
    verified: boolean;
    welcomeStatus: 'sent' | 'retrying' | 'pending' | 'not_queued';
  }[];
}
