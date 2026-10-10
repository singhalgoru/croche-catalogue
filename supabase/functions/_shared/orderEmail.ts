interface OrderItem {
  product_name: string;
  variant_name: string;
  quantity: number;
  line_total_paise: number;
}
export interface EmailOrder {
  reference: string;
  status: string;
  is_live_checkout: boolean;
  customer_name: string;
  customer_contact: string;
  customer_email: string | null;
  delivery_details: Record<string, string>;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  total_paise: number;
  payment_order_items: OrderItem[];
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const money = (paise: number) => `INR ${(paise / 100).toFixed(2)}`;

export async function sendOrderEmail(
  job: { id: string; audience: 'customer' | 'store'; recipient: string },
  order: EmailOrder, apiKey: string, sender: string,
): Promise<string> {
  if (order.status !== 'paid' || !order.is_live_checkout) throw new Error('Only confirmed live orders can send order emails.');
  const address = ['addressLine1','addressLine2','city','state','pincode']
    .map(key => order.delivery_details[key]).filter(Boolean).join(', ');
  const text = [
    'Luvia Creations',
    job.audience === 'store' ? 'New paid order - ready for fulfilment' : `Thank you, ${order.customer_name}! Your order is confirmed.`,
    `Order: ${order.reference}`, 'Payment received',
    ...order.payment_order_items.map(item =>
      `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''} x ${item.quantity}: ${money(item.line_total_paise)}`),
    `Items subtotal: ${money(order.subtotal_paise)}`, `Coupon discount: ${money(order.discount_paise)}`,
    `Shipping: ${money(order.shipping_paise)}`, `Total paid: ${money(order.total_paise)}`,
    `Recipient: ${order.customer_name}`, `Mobile: ${order.customer_contact}`,
    `Email: ${order.customer_email ?? ''}`, `Delivery address: ${address}, India`,
    'Dispatch within 5 days of receiving the order, or earlier. Delivery after dispatch depends on your location.',
    'For cancellations before dispatch or order support, email orders@luviacreations.com with your order reference.',
    'Policies: https://luviacreations.com/return-policy/',
    'With love, Team Luvia',
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `order-confirmation-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: sender, to: [job.recipient], reply_to: 'orders@luviacreations.com',
      subject: `${job.audience === 'store' ? 'New paid order' : 'Order confirmed'} - ${order.reference} - Luvia Creations`,
      text,
      html: `<html lang="en"><body style="background:#fff9ef;color:#604439;font-family:Arial,sans-serif;padding:24px;">
        <div style="max-width:600px;margin:auto;background:white;padding:24px;border-radius:16px;">
        <img src="https://luviacreations.com/images/luvia-logo.jpg" width="100" alt="Luvia Creations">
        <h1 style="font-size:24px;">${job.audience === 'store' ? 'New paid order' : 'Your order is confirmed'}</h1>
        ${text.split('\n').map(line => `<p style="line-height:1.6;">${escapeHtml(line)}</p>`).join('')}
        </div></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Order email provider returned HTTP ${response.status}.`);
  const accepted = await response.json();
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid order email provider confirmation.');
  return accepted.id;
}
