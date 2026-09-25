export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  image: string;
  unitPrice: number | null;
  quantity: number;
}

export interface Cart {
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
