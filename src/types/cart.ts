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

export interface Cart {
  deliveryPinCode?: string | null;
  deliveryPinLocation?: { districts: string[]; states: string[]; country: 'India' } | null;
  deliveryPinCheckedAt?: string | null;
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
}
