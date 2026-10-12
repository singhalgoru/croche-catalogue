export interface PasswordChangeEmailJob {
  id: string;
  recipient: string;
  changed_at: string;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function buildPasswordChangeEmail(job: PasswordChangeEmailJob) {
  const changedAt = new Date(job.changed_at);
  if (!Number.isFinite(changedAt.getTime())) throw new Error('Invalid password change timestamp.');
  const time = `${changedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const text = [
    'Luvia Creations - Handmade with love, just for you',
    'Your login password has changed',
    `The login password for your Luvia account ${job.recipient} was changed on ${time}.`,
    'If you requested this change, no further action is needed. Use your new password the next time you sign in.',
    'If you did not request this change, please reply to this email immediately so our team can help secure your account.',
    'You can also contact hello@luviacreations.com and use Forgot password on https://luviacreations.com/ to reset your password.',
    'We will never ask you to share your password or verification codes by email.',
    'With care, Team Luvia',
  ].join('\n\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;background:#fff9ef;font-family:Arial,sans-serif;color:#604439;">
    <div style="display:none;max-height:0;overflow:hidden;">Your Luvia login password changed. If this was not you, reply immediately.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #eddfcb;border-radius:20px;">
    <tr><td align="center" style="padding:28px 24px;background:#fff9ef;border-radius:20px 20px 0 0;">
      <a href="https://luviacreations.com/"><img src="https://luviacreations.com/images/luvia-logo.jpg" width="100" alt="Luvia Creations" style="display:block;border:0;border-radius:50px;"></a>
      <h2 style="margin:16px 0 6px;font-size:24px;">Luvia Creations</h2>
      <p style="margin:0;color:#8c776c;font-size:14px;">Handmade with love, just for you</p>
    </td></tr><tr><td style="padding:24px;">
      <h1 style="margin:0 0 16px;font-size:26px;">Your login password has changed</h1>
      <p style="line-height:1.7;">The login password for your Luvia account <strong>${escapeHtml(job.recipient)}</strong> was changed.</p>
      <p style="font-size:14px;line-height:1.7;color:#8c776c;">Changed on: ${escapeHtml(time)}</p>
      <p style="line-height:1.7;">If you requested this change, no further action is needed. Use your new password the next time you sign in.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#fff9ef;border-left:4px solid #d4ab58;border-radius:12px;">
        <tr><td style="padding:18px;line-height:1.7;"><strong>Was this not you?</strong><br>
        If you did not request this change, please <strong>reply to this email immediately</strong> so our team can help secure your account.</td></tr>
      </table>
      <p style="line-height:1.7;">You can also contact <a href="mailto:hello@luviacreations.com" style="color:#604439;">hello@luviacreations.com</a> and use <strong>Forgot password</strong> on our website to reset your password.</p>
      <p><a href="https://luviacreations.com/" style="display:inline-block;padding:12px 20px;background:#604439;color:#ffffff;border-radius:24px;text-decoration:none;">Visit Luvia Creations</a></p>
      <p style="font-size:13px;line-height:1.7;color:#8c776c;">We will never ask you to share your password or verification codes by email.</p>
      <p style="line-height:1.7;">With care,<br><strong>Team Luvia</strong></p>
    </td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}

export async function sendPasswordChangeEmail(job: PasswordChangeEmailJob, apiKey: string): Promise<string> {
  const { text, html } = buildPasswordChangeEmail(job);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `password-change-${job.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ from: 'Luvia Creations <hello@luviacreations.com>', to: [job.recipient], reply_to: 'hello@luviacreations.com',
      subject: 'Your login password has changed - Luvia Creations', text, html }),
  });
  if (!response.ok) throw new Error(`Password notification provider returned HTTP ${response.status}.`);
  const accepted = await response.json();
  if (typeof accepted?.id !== 'string' || !accepted.id) throw new Error('Invalid password notification provider confirmation.');
  return accepted.id;
}
