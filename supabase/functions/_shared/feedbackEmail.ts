export interface FeedbackJob {
  id: string;
  message: string;
  category: string;
  contact_name: string;
  contact_email: string;
  wants_reply: boolean;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function buildFeedbackEmail(job: FeedbackJob) {
  const contact = job.wants_reply ? `Reply requested: ${job.contact_email}` : 'No reply requested. Contact email was not collected.';
  const text = ['Luvia Creations - Store feedback', `Type: ${job.category}`,
    `Name: ${job.contact_name || 'Not provided'}`, contact, '', job.message, '', `Feedback reference: ${job.id}`,
    'Feedback is private. This is not a verified purchase review.'].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#fff9ef;font-family:Arial,sans-serif;color:#604439;">
    <table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" style="max-width:600px;background:white;border:1px solid #eddfcb;border-radius:20px;">
    <tr><td align="center" style="padding:24px;background:#fff9ef;"><img src="https://luviacreations.com/images/luvia-logo.jpg" alt="Luvia Creations" width="100" style="border-radius:50px;">
    <h1>New feedback for Luvia</h1><p>Handmade with love, just for you</p></td></tr>
    <tr><td style="padding:24px;line-height:1.7;">
    <p><strong>Type:</strong> ${escapeHtml(job.category)}<br><strong>Name:</strong> ${escapeHtml(job.contact_name || 'Not provided')}<br>${escapeHtml(contact)}</p>
    <div style="white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;background:#fff9ef;border-left:4px solid #d4ab58;">${escapeHtml(job.message)}</div>
    <p style="font-size:12px;">Reference: ${escapeHtml(job.id)}<br>Feedback is private. This is not a verified purchase review.</p>
    </td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
export async function sendFeedbackEmail(job: FeedbackJob, apiKey: string): Promise<string> {
  if (job.wants_reply && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.contact_email)) throw new Error('Invalid feedback reply email.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `feedback-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ from: 'Luvia Creations <hello@luviacreations.com>', to: ['feedback@luviacreations.com'],
      reply_to: job.wants_reply ? job.contact_email : 'feedback@luviacreations.com',
      subject: 'New store feedback - Luvia Creations', ...buildFeedbackEmail(job) }),
  });
  if (!response.ok) throw new Error(`Feedback provider returned HTTP ${response.status}.`);
  const accepted = await response.json();
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid feedback provider confirmation.');
  return accepted.id;
}
