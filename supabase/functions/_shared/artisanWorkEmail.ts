export interface WorkItem {
  name: string;
  quantity: number;
  rateWithYarn: number;
  rateWithoutYarn: number;
  patternFilename: string | null;
  yarnBasis?: 'with' | 'without';
}

export interface WorkOffer {
  recipientName: string;
  reference: string;
  subject: string;
  message: string;
  deliveryDate: string;
  courierCap: number;
  items: WorkItem[];
  advancePercent?: number;
  qualityTerms?: string;
}

export const WORK_QUALITY_TERMS = 'Delivered products must meet the quality standards agreed before work begins. Products that do not meet those standards may be rejected and will be returned after the advance payment is returned. Luvia will bear the return shipment courier charges.';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function isWorkOffer(value: unknown): value is WorkOffer {
  return record(value) && typeof value.recipientName === 'string' && value.recipientName.length > 0 && value.recipientName.length <= 100
    && typeof value.reference === 'string' && /^[0-9a-f-]{36}$/i.test(value.reference)
    && typeof value.subject === 'string' && value.subject.length > 0 && value.subject.length <= 150 && !/[\r\n]/.test(value.subject)
    && typeof value.message === 'string' && value.message.length > 0 && value.message.length <= 3000
    && typeof value.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.deliveryDate)
    && typeof value.courierCap === 'number' && Number.isFinite(value.courierCap) && value.courierCap >= 0
    && ((value.advancePercent === undefined && value.qualityTerms === undefined)
      || (typeof value.advancePercent === 'number' && Number.isFinite(value.advancePercent)
        && value.advancePercent >= 0 && value.advancePercent <= 100
        && Math.abs(value.advancePercent * 100 - Math.round(value.advancePercent * 100)) < 1e-8 && typeof value.qualityTerms === 'string'
        && value.qualityTerms.length > 0 && value.qualityTerms.length <= 1000))
    && Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 10
    && value.items.every((item: unknown) => record(item) && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 100
      && typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0
      && typeof item.rateWithYarn === 'number' && Number.isFinite(item.rateWithYarn) && item.rateWithYarn >= 0
      && typeof item.rateWithoutYarn === 'number' && Number.isFinite(item.rateWithoutYarn) && item.rateWithoutYarn >= 0
      && (value.advancePercent === undefined ? item.yarnBasis === undefined : item.yarnBasis === 'with' || item.yarnBasis === 'without')
      && (item.patternFilename === null || (typeof item.patternFilename === 'string' && /^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$/.test(item.patternFilename))));
}

export interface WorkEmailJob {
  id: string;
  kind: 'offer' | 'acceptance';
  token: string | null;
  offer: WorkOffer;
  recipientEmail: string;
  acceptedAt: string | null;
  attachments: { filename: string; content: string }[];
}

export function isWorkEmailJob(value: unknown): value is WorkEmailJob {
  return record(value) && typeof value.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id)
    && (value.kind === 'offer' || value.kind === 'acceptance') && isWorkOffer(value.offer)
    && typeof value.recipientEmail === 'string' && value.recipientEmail.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.recipientEmail)
    && (value.kind === 'offer' ? typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token)
      : value.token === null && typeof value.acceptedAt === 'string' && !Number.isNaN(Date.parse(value.acceptedAt)))
    && Array.isArray(value.attachments) && value.attachments.length <= 10
    && value.attachments.every((attachment: unknown) => record(attachment)
      && typeof attachment.filename === 'string' && /^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$/.test(attachment.filename)
      && typeof attachment.content === 'string' && attachment.content.startsWith('JVBERi0')
      && /^[A-Za-z0-9+/]+={0,2}$/.test(attachment.content));
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const money = (amount: number) => `INR ${amount.toFixed(2)}`;

export function workPaymentSummary(offer: WorkOffer) {
  if (offer.advancePercent === undefined) return null;
  const paise = (amount: number) => {
    const [rupees, fraction] = amount.toFixed(2).split('.');
    return BigInt(rupees!) * 100n + BigInt(fraction!);
  };
  const total = offer.items.reduce((sum, item) => sum + BigInt(item.quantity)
    * paise(item.yarnBasis === 'with' ? item.rateWithYarn : item.rateWithoutYarn), 0n);
  const advance = (total * BigInt(Math.round(offer.advancePercent * 100)) + 5000n) / 10000n;
  const format = (amount: bigint) => `INR ${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
  return { total: format(total), advance: format(advance), balance: format(total - advance) };
}

export function buildArtisanWorkEmail(offer: WorkOffer, acceptanceUrl: string) {
  const payment = workPaymentSummary(offer);
  const rows = offer.items.map(item => `<tr>
    <td style="padding:10px;border-bottom:1px solid #e8ddcb">${escapeHtml(item.name)}${item.yarnBasis ? `<br><small>Agreed rate: ${item.yarnBasis === 'with' ? 'including yarn' : 'excluding yarn'}</small>` : ''}${item.patternFilename ? `<br><small>Pattern attached: ${escapeHtml(item.patternFilename)}</small>` : ''}</td>
    <td style="padding:10px;border-bottom:1px solid #e8ddcb">${item.quantity}</td>
    <td style="padding:10px;border-bottom:1px solid #e8ddcb">${money(item.rateWithYarn)}</td>
    <td style="padding:10px;border-bottom:1px solid #e8ddcb">${money(item.rateWithoutYarn)}</td>
  </tr>`).join('');
  const items = offer.items.map(item => `${item.name}: ${item.quantity} units; including yarn ${money(item.rateWithYarn)}/unit; excluding yarn ${money(item.rateWithoutYarn)}/unit${item.yarnBasis ? `; agreed rate: ${item.yarnBasis === 'with' ? 'including yarn' : 'excluding yarn'}` : ''}${item.patternFilename ? `; pattern attached: ${item.patternFilename}` : ''}`).join('\n');
  const paymentText = payment ? `\nTotal work payment: ${payment.total}\nAdvance before work starts (${offer.advancePercent}%): ${payment.advance}\nBalance after work completion: ${payment.balance}\nCourier reimbursement is separate and subject to the maximum above.\n\nQuality and returns: ${offer.qualityTerms}` : '';
  return {
    subject: offer.subject,
    text: `Hello ${offer.recipientName},\n\n${offer.message}\n\n${items}\n\nDelivery date: ${offer.deliveryDate}\nMaximum courier reimbursement: ${money(offer.courierCap)}\n${paymentText}\n\nReview and explicitly accept this assignment: ${acceptanceUrl}\nThis private link expires 30 days after the assignment is created. Anyone with the link can accept; please do not share it. Contact us if you have questions before accepting. Keep any attached patterns private.\n\nWith love,\nLuvia Creations`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#fffaf0;color:#5d4037;font-family:Arial,sans-serif;padding:24px">
      <div style="max-width:680px;margin:auto;background:#fff;border:1px solid #eee1cb;border-radius:16px;padding:24px">
      <img src="https://luviacreations.com/images/luvia-pattern-logo.jpg" width="100" height="100" alt="Luvia Creations" style="display:block;margin:0 auto">
      <h1 style="border-bottom:4px solid #f6c453;padding-bottom:12px">Your Luvia work assignment</h1>
      <p>Hello ${escapeHtml(offer.recipientName)},</p><p style="white-space:pre-wrap">${escapeHtml(offer.message)}</p>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px;text-align:left">
      <thead><tr style="background:#fff4d6"><th style="padding:10px">Product</th><th style="padding:10px">Qty</th><th style="padding:10px">Including yarn / unit</th><th style="padding:10px">Excluding yarn / unit</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p><strong>Delivery date:</strong> ${escapeHtml(offer.deliveryDate)}<br><strong>Maximum courier reimbursement:</strong> ${money(offer.courierCap)}</p>
      ${payment ? `<p><strong>Total work payment:</strong> ${payment.total}<br><strong>Advance before work starts (${offer.advancePercent}%):</strong> ${payment.advance}<br><strong>Balance after work completion:</strong> ${payment.balance}<br>Courier reimbursement is separate and subject to the maximum above.</p><p><strong>Quality and returns:</strong> ${escapeHtml(offer.qualityTerms!)}</p>` : ''}
      <p><a href="${escapeHtml(acceptanceUrl)}" style="display:inline-block;background:#5d4037;color:#fffaf0;border-radius:24px;padding:12px 20px;text-decoration:none">Review and accept assignment</a></p>
      <p>Opening the link does not accept the assignment. The link expires 30 days after creation. Anyone with the link can accept; please keep it private. Contact us with questions before accepting. Keep any attached patterns private.</p>
      <p>With love,<br>Luvia Creations</p></div></body></html>`,
  };
}

export function buildArtisanWorkAcceptanceEmail(offer: WorkOffer, acceptedAt: string) {
  const items = offer.items.map(item => `${item.name} (${item.quantity})`).join(', ');
  const payment = workPaymentSummary(offer);
  const text = `${offer.recipientName} accepted the work assignment for ${items}.\nDelivery date: ${offer.deliveryDate}\nAccepted at: ${acceptedAt}\n\n${offer.items.map(item => `${item.name}: ${item.quantity} units; including yarn ${money(item.rateWithYarn)}/unit; excluding yarn ${money(item.rateWithoutYarn)}/unit${item.yarnBasis ? `; agreed rate: ${item.yarnBasis === 'with' ? 'including yarn' : 'excluding yarn'}` : ''}`).join('\n')}\nMaximum courier reimbursement: ${money(offer.courierCap)}${payment ? `\nTotal work payment: ${payment.total}\nAdvance before work starts (${offer.advancePercent}%): ${payment.advance}\nBalance after work completion: ${payment.balance}\nCourier reimbursement is separate and subject to the maximum above.\nQuality and returns: ${offer.qualityTerms}` : ''}`;
  return {
    subject: `Work assignment accepted - ${offer.recipientName.replace(/[\r\n]/g, ' ')}`,
    text,
    html: `<html><body style="background:#fffaf0;color:#5d4037;font-family:Arial,sans-serif;padding:24px"><img src="https://luviacreations.com/images/luvia-pattern-logo.jpg" width="100" height="100" alt="Luvia Creations"><h1>Work assignment accepted</h1><p style="white-space:pre-wrap">${escapeHtml(text)}</p></body></html>`,
  };
}

export async function sendArtisanWorkEmail(job: WorkEmailJob, apiKey: string): Promise<string> {
  const content = job.kind === 'offer'
    ? buildArtisanWorkEmail(job.offer, `https://luviacreations.com/artisans/#work=${job.token}`)
    : buildArtisanWorkAcceptanceEmail(job.offer, job.acceptedAt!);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `artisan-work-${job.kind}-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ from: 'Luvia Creations <onboarding@luviacreations.com>',
      to: [job.kind === 'offer' ? job.recipientEmail : 'info@luviacreations.com'],
      reply_to: 'info@luviacreations.com', ...content,
      attachments: job.attachments.map(attachment => ({ filename: attachment.filename,
        content: attachment.content, content_type: 'application/pdf' })) }),
  });
  if (!response.ok) throw new Error(`Work assignment email provider returned HTTP ${response.status}.`);
  const receipt: unknown = await response.json();
  if (!record(receipt) || typeof receipt.id !== 'string' || !receipt.id) throw new Error('Work assignment email acceptance could not be confirmed.');
  return receipt.id;
}
