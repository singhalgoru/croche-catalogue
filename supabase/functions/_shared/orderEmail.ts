interface OrderItem {
  product_name: string;
  variant_name: string;
  product_public_slug: string | null;
  image_url: string;
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
const productUrl = (item: OrderItem) => item.product_public_slug
  ? `https://luviacreations.com/p/${encodeURIComponent(item.product_public_slug)}/` : null;

export function buildOrderEmail(order: EmailOrder, audience: 'customer' | 'store') {
  const address = ['addressLine1','addressLine2','city','state','pincode']
    .map(key => order.delivery_details[key]).filter(Boolean).join(', ');
  const text = [
    'Luvia Creations - Handmade with love, just for you',
    audience === 'store' ? 'New paid order - ready for fulfilment' : `Thank you, ${order.customer_name}! Your order is confirmed.`,
    `Order ID: ${order.reference}`, 'Payment received',
    ...order.payment_order_items.flatMap(item => [
      `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''} x ${item.quantity}: ${money(item.line_total_paise)}`,
      ...(productUrl(item) ? [`View product: ${productUrl(item)}`] : []),
    ]),
    `Items subtotal: ${money(order.subtotal_paise)}`, `Coupon discount: ${money(order.discount_paise)}`,
    `Shipping: ${order.shipping_paise ? money(order.shipping_paise) : 'Free'}`, `Total paid: ${money(order.total_paise)}`,
    `Recipient: ${order.customer_name}`, `Mobile: ${order.customer_contact}`,
    `Email: ${order.customer_email ?? ''}`, `Delivery address: ${address}, India`,
    'Dispatch within 5 days of receiving the order, or earlier. Delivery after dispatch depends on your location.',
    'For cancellations before dispatch or order support, email orders@luviacreations.com with your Order ID.',
    'Policies: https://luviacreations.com/return-policy/',
    'With love, Team Luvia',
  ].join('\n');
  const items = order.payment_order_items.map(item => {
    const url = productUrl(item);
    let image = '';
    if (item.image_url) {
      const parsed = new URL(item.image_url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Order product image must use a public HTTPS URL.');
      image = `<img src="${escapeHtml(parsed.href)}" width="112" alt="${escapeHtml(item.product_name)}" style="display:block;width:112px;max-width:100%;height:auto;border:0;border-radius:12px;">`;
    }
    const name = `<strong style="font-size:16px;">${escapeHtml(item.product_name)}</strong>`;
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #eddfcb;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${image ? `<td width="112" valign="top" style="padding-right:16px;">${url ? `<a href="${escapeHtml(url)}">${image}</a>` : image}</td>` : ''}
      <td valign="top" style="line-height:1.6;color:#604439;">
      ${url ? `<a href="${escapeHtml(url)}" style="color:#604439;text-decoration:none;">${name}</a>` : name}
      ${item.variant_name ? `<div style="font-size:13px;color:#8c776c;">${escapeHtml(item.variant_name)}</div>` : ''}
      <div style="font-size:14px;">Quantity: ${item.quantity}</div>
      <div style="font-weight:bold;">${money(item.line_total_paise)}</div>
      ${url ? `<a href="${escapeHtml(url)}" style="font-size:13px;color:#604439;">View product</a>` : ''}
      </td></tr></table></td></tr>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#fff9ef;font-family:Arial,sans-serif;color:#604439;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #eddfcb;border-radius:20px;">
    <tr><td align="center" style="padding:28px 24px;background:#fff9ef;border-radius:20px 20px 0 0;">
      <a href="https://luviacreations.com/"><img src="https://luviacreations.com/images/luvia-logo.jpg" width="100" alt="Luvia Creations" style="display:block;border:0;border-radius:50px;"></a>
      <h2 style="margin:16px 0 6px;font-size:24px;">Luvia Creations</h2>
      <p style="margin:0;color:#8c776c;font-size:14px;">Handmade with love, just for you</p>
    </td></tr><tr><td style="padding:24px;">
      <h1 style="margin:0 0 16px;font-size:26px;">${audience === 'store' ? 'A new paid order is here' : 'Thank you! Your order is confirmed'}</h1>
      <p style="line-height:1.7;">${audience === 'store'
        ? `Payment received for ${escapeHtml(order.customer_name)}'s order. Please prepare it for fulfilment.`
        : `Hi ${escapeHtml(order.customer_name)},<br>Thank you for choosing Luvia Creations! Your payment has been received and your order is confirmed. We cannot wait to create a little handmade joy for you.`}</p>
      <div style="padding:18px;background:#fff9ef;border:1px dashed #bd9856;border-radius:12px;">
        <span style="font-size:12px;color:#8c776c;">ORDER ID</span>
        <p style="margin:6px 0;font-size:20px;font-weight:bold;">${escapeHtml(order.reference)}</p>
        <span style="color:#276749;font-size:14px;font-weight:bold;">Payment received</span>
      </div>
      <h2 style="margin:28px 0 0;font-size:20px;">Your order</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;font-size:14px;line-height:1.8;">
        <tr><td>Items subtotal</td><td align="right">${money(order.subtotal_paise)}</td></tr>
        ${order.discount_paise ? `<tr style="color:#276749;"><td>Coupon discount</td><td align="right">-${money(order.discount_paise)}</td></tr>` : ''}
        <tr><td>Shipping</td><td align="right">${order.shipping_paise ? money(order.shipping_paise) : 'Free'}</td></tr>
        <tr style="font-size:18px;font-weight:bold;"><td style="padding-top:12px;border-top:1px solid #eddfcb;">Total paid</td><td align="right" style="padding-top:12px;border-top:1px solid #eddfcb;">${money(order.total_paise)}</td></tr>
      </table>
      <h2 style="margin:28px 0 12px;font-size:20px;">Delivery details</h2>
      <p style="margin:0;line-height:1.7;">${escapeHtml(order.customer_name)}<br>${escapeHtml(address)}, India<br>${escapeHtml(order.customer_contact)}${order.customer_email ? `<br>${escapeHtml(order.customer_email)}` : ''}</p>
      <h2 style="margin:28px 0 12px;font-size:20px;">What happens next?</h2>
      <p style="line-height:1.7;">We will dispatch your order within 5 days of receiving it, or earlier. Delivery after dispatch depends on your location.</p>
      <p style="line-height:1.7;">Need help or wish to cancel before dispatch? Email <a href="mailto:orders@luviacreations.com" style="color:#604439;">orders@luviacreations.com</a> with your Order ID.</p>
      <p style="margin-top:24px;line-height:1.7;">With love,<br><strong>Team Luvia</strong></p>
    </td></tr><tr><td align="center" style="padding:20px;background:#fff9ef;border-radius:0 0 20px 20px;font-size:12px;color:#8c776c;line-height:1.8;">
      Gurgaon, Haryana, India<br><a href="https://luviacreations.com/" style="color:#604439;">Visit Luvia Creations</a> &middot;
      <a href="https://luviacreations.com/return-policy/" style="color:#604439;">Returns and cancellation policy</a>
    </td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendOrderEmail(
  job: { id: string; audience: 'customer' | 'store'; recipient: string },
  order: EmailOrder, apiKey: string, sender: string,
): Promise<string> {
  if (order.status !== 'paid' || !order.is_live_checkout) throw new Error('Only confirmed live orders can send order emails.');
  const { text, html } = buildOrderEmail(order, job.audience);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `order-confirmation-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: sender, to: [job.recipient], reply_to: 'orders@luviacreations.com',
      subject: `${job.audience === 'store' ? 'New paid order' : 'Order confirmed'} - ${order.reference} - Luvia Creations`,
      text,
      html,
    }),
  });
  if (!response.ok) throw new Error(`Order email provider returned HTTP ${response.status}.`);
  const accepted = await response.json();
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid order email provider confirmation.');
  return accepted.id;
}
