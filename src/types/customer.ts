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
