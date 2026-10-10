interface Coupon {
  id: string;
  email: string;
  code: string;
  percent: number;
  max_discount_rupees: number;
  minimum_subtotal_rupees: number;
  expires_at: string;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export interface WelcomeProduct { name: string; url: string; image: string }

export async function sendWelcomeEmail(coupon: Coupon, apiKey: string, sender: string, products: WelcomeProduct[]) {
  const expiry = new Date(coupon.expires_at).toISOString().slice(0, 10);
  const text = [
    'Welcome to Luvia Creations!',
    "We're so happy you're part of our little world of handmade joy.",
    'Your verified account is ready. Here is a little welcome gift for your first order:',
    `Your personal coupon: ${coupon.code}`,
    `${coupon.percent}% off your first order, up to ₹${coupon.max_discount_rupees}.`,
    `Minimum items subtotal: ₹${coupon.minimum_subtotal_rupees}. Shipping is excluded.`,
    `Valid until ${expiry}.`,
    'Enter this code from your verified account when sending your order request.',
    'One use per verified email. Cannot be combined with other offers. Availability and final total require confirmation.',
    'https://luviacreations.com/',
    ...products.flatMap(product => [product.name, product.url]),
    'With love, Team Luvia',
  ].join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `welcome-coupon-${coupon.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: sender, to: [coupon.email], subject: 'Welcome to Luvia - a little gift for your first order',
      text,
      html: `<html lang="en"><body style="margin:0;background:#fff9ef;font-family:Arial,sans-serif;color:#604439;">
        <table role="presentation" width="100%" style="padding:24px;"><tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:white;border-radius:20px;"><tr><td style="padding:32px;">
        <img src="https://luviacreations.com/images/luvia-logo.jpg" width="120" alt="Luvia Creations" style="display:block;border:0;margin:0 auto;border-radius:60px;">
        <h2 style="text-align:center;">Luvia Creations</h2>
        <p style="text-align:center;color:#8c776c;">Handmade with love, just for you</p>
        <h1 style="font-size:25px;">You're part of the Luvia family!</h1>
        <p style="line-height:1.7;">Your account is activated. We're delighted to welcome you to our little world of handmade joy.
        As a thank-you, here's a little gift for your first order.</p>
        <div style="padding:24px;background:#fff9ef;border:1px dashed #bd9856;text-align:center;border-radius:12px;">
          <p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${escapeHtml(coupon.code)}</p>
          <p>${coupon.percent}% off items, up to ₹${coupon.max_discount_rupees}</p>
          <p style="font-size:13px;">Minimum items subtotal ₹${coupon.minimum_subtotal_rupees}. Valid until ${expiry}.</p>
        </div>
        <p style="line-height:1.7;">Browse your crochet favourites and enter this code when sending your order request.</p>
        <a href="https://luviacreations.com/" style="display:inline-block;background:#604439;color:white;padding:16px 24px;border-radius:28px;text-decoration:none;">Explore handmade favourites</a>
        ${products.length ? `<h2 style="font-size:21px;margin-top:32px;">Bestsellers to fall in love with</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${products.map(product => `
          <tr><td style="padding:12px 0;border-bottom:1px solid #eddfcb;">
          <a href="${escapeHtml(product.url)}" style="color:#604439;text-decoration:none;">
            <img src="${escapeHtml(product.image)}" width="180" alt="${escapeHtml(product.name)}" style="display:block;max-width:100%;border:0;border-radius:12px;">
            <p style="font-size:16px;font-weight:bold;">${escapeHtml(product.name)}</p>
            <span style="color:#604439;text-decoration:underline;">View product</span>
          </a></td></tr>`).join('')}</table>` : ''}
        <p style="font-size:12px;line-height:1.6;color:#8c776c;">One use per verified email. Shipping excluded.
        Cannot be combined with other offers. Availability, eligibility and final total require confirmation.</p>
        <p>With love,<br><strong>Team Luvia</strong></p>
        </td></tr></table></td></tr></table></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Welcome email provider returned HTTP ${response.status}.`);
  const accepted = await response.json();
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid email provider confirmation.');
}
