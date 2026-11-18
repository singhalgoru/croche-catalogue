export interface ProductPatternEmailJob {
  id: string;
  recipient_name: string;
  recipient_email: string;
  product_name: string;
  filename: string;
  message: string;
  data: string;
  language: 'en' | 'hi';
}

export function isProductPatternEmailJob(value: unknown): value is ProductPatternEmailJob {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && /^[0-9a-f-]{36}$/i.test(row.id)
    && typeof row.recipient_email === 'string' && row.recipient_email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.recipient_email)
    && typeof row.recipient_name === 'string' && row.recipient_name.length <= 100
    && typeof row.product_name === 'string' && row.product_name.length <= 100
    && typeof row.filename === 'string' && row.filename.length <= 120
    && /^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$/.test(row.filename)
    && (row.language === 'en' || row.language === 'hi')
    && typeof row.message === 'string' && row.message.length <= 1500
    && typeof row.data === 'string' && row.data.length >= 136 && row.data.length <= 2796204
    && row.data.startsWith('JVBERi0') && /^[A-Za-z0-9+/]+={0,2}$/.test(row.data);
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function buildProductPatternEmail(job: ProductPatternEmailJob) {
  const subject = `Luvia crochet pattern - ${job.product_name.replace(/[\r\n]/g, ' ')}`;
  const terms = 'Please use the attached print-enabled PDF pattern for this product and reply with any questions. '
    + 'Keep this working pattern private. This email is not a work order: please wait for separate confirmation '
    + 'of the sample, quantity, rate, materials, courier terms and deadline before starting production.';
  return {
    subject,
    text: `Hello ${job.recipient_name},\n\nPattern for: ${job.product_name}\nAttachment: ${job.filename}\n\n${job.message ? `${job.message}\n\n` : ''}${terms}\n\nWith love,\nLuvia Creations`,
    html: `<!doctype html><html lang="en"><body style="background:#fffaf0;color:#5d4037;font-family:Arial,sans-serif;padding:24px">
      <div style="max-width:600px;margin:auto">
      <img src="https://luviacreations.com/images/luvia-pattern-logo.jpg" width="100" height="100" alt="Luvia Creations" style="display:block;margin:0 auto">
      <h1 style="border-bottom:4px solid #f6c453;padding-bottom:12px">Your crochet working pattern</h1>
      <p>Hello ${escapeHtml(job.recipient_name)},</p>
      <p><strong>${escapeHtml(job.product_name)}</strong><br>PDF attachment: ${escapeHtml(job.filename)}</p>
      ${job.message ? `<p style="white-space:pre-wrap">${escapeHtml(job.message)}</p>` : ''}
      <p>${terms}</p><p>Questions? Reply to this email.</p><p>With love,<br>Luvia Creations</p>
      </div></body></html>`,
  };
}

export async function sendProductPatternEmail(job: ProductPatternEmailJob, apiKey: string): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `product-pattern-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: 'Luvia Creations <onboarding@luviacreations.com>', to: [job.recipient_email],
      reply_to: 'hello@luviacreations.com', ...buildProductPatternEmail(job),
      attachments: [{ filename: job.filename, content: job.data,
        content_type: 'application/pdf' }],
    }),
  });
  if (!response.ok) throw new Error(`Pattern email provider returned HTTP ${response.status}.`);
  const receipt: unknown = await response.json();
  if (!receipt || typeof receipt !== 'object' || !('id' in receipt)
    || typeof receipt.id !== 'string' || !receipt.id) throw new Error('Pattern email acceptance could not be confirmed.');
  return receipt.id;
}
