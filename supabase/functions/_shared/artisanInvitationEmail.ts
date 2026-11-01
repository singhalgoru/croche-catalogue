const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function buildArtisanInvitationEmail(name: string, link: string, expiresAt: string) {
  const safeName = Array.from(name).filter(char => {
    const code = char.codePointAt(0)!;
    return code >= 32 && code !== 127;
  }).join('').replace(/\s+/g, ' ').trim();
  const expiry = new Date(expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' }) + ' IST';
  const terms = 'Applying does not guarantee work. We start with a small paid trial with no application fee or trial deposit. The artisan bears the agreed courier charge to receive batch materials; the estimate must be accepted before dispatch. Rates, scope and deadlines are agreed before work starts. The form explains the full material-dispatch terms. ID upload is optional: use only a permanently masked Aadhaar or alternative ID photo with separate consent. Never send a full Aadhaar number, QR/barcode, bank details or OTP.';
  const steps = [
    ['Apply', 'Share your craft and contact details.'],
    ['Review', 'Luvia reviews your application privately.'],
    ['Email update', 'Receive a decision or a request for more information.'],
    ['Agree a paid trial', 'Set batch scope, rate and timing before work begins.'],
  ];
  const processText = `Onboarding process:\n${steps.map(([title, description], index) => `${index + 1}. ${title}: ${description}`).join('\n')}`;
  const processHtml = `<section aria-label="Onboarding process" style="margin:20px 0;padding:16px;background:#fffaf0;border:1px solid #e8dcc5;border-radius:12px">
    <h2 style="margin:0 0 12px;font-size:18px">Onboarding process</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    ${steps.map(([title, description], index) => `<tr><td width="36" valign="top" style="padding:6px 8px 6px 0;font-weight:bold">${index + 1}.</td>
      <td style="padding:6px 0;line-height:1.5"><strong>${title}</strong><br>${description}</td></tr>
      ${index < steps.length - 1 ? '<tr><td colspan="2" align="center" aria-hidden="true" style="height:16px;color:#8b6b51">&darr;</td></tr>' : ''}`).join('')}
    </table></section>`;
  const text = `Hello ${safeName},\n\nLuvia Creations invites you to share your crochet and handmade skills for possible home-based, batch-by-batch work.\n\nComplete your private application: ${link}\n\n${processText}\n\nThis link expires 24 hours after creation (${expiry}) or after one submission, whichever comes first. Keep it private; anyone with it can submit the application. No account is needed.\n\n${terms}\n\nIf you were not expecting this invitation, you can ignore it. Questions or privacy requests: hello@luviacreations.com.\n\nWith love,\nLuvia Creations`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;width:100%;background:#fffaf0;color:#604239;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffaf0" style="width:100%;background:#fffaf0">
  <tr><td align="center" style="padding:0 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffaf0" style="width:100%;max-width:600px;background:#fffaf0;line-height:1.7">
  <tr><td align="center" style="padding:24px 16px 8px">
  <a href="https://luviacreations.com/" style="display:inline-block;text-decoration:none"><img src="https://luviacreations.com/images/luvia-logo-160.webp" alt="Luvia Creations" width="96" height="96" style="display:block;width:96px;height:96px;margin:0 auto;border:0"></a>
  <h1 style="margin:16px 0 0;text-align:center;color:#604239">Create with Luvia</h1>
  </td></tr><tr><td style="padding:8px 20px 24px">
  <p>Hello ${escapeHtml(safeName)},</p>
  <p>We invite you to share your crochet and handmade skills for possible home-based, batch-by-batch work.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#604239;color:#fffaf0;border-radius:24px">Complete your artisan application</a></p>
  ${processHtml}
  <p>This link expires 24 hours after creation (${escapeHtml(expiry)}) or after one submission, whichever comes first. Keep it private; anyone with it can submit the application. No account is needed.</p>
  <p>${escapeHtml(terms)}</p>
  <p>If you were not expecting this invitation, you can ignore it. Questions or privacy requests: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a>.</p>
  <p>With love,<br>Luvia Creations</p></td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
export async function sendArtisanInvitationEmail(invitation: {
  id: string; recipient_name: string; contact: string; expires_at: string;
}, link: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `artisan-invite-${invitation.id}` },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: 'Luvia Creations <onboarding@luviacreations.com>', to: [invitation.contact],
      reply_to: 'hello@luviacreations.com', subject: 'Your artisan application invitation - Luvia Creations',
      ...buildArtisanInvitationEmail(invitation.recipient_name, link, invitation.expires_at),
    }),
  });
  if (!response.ok) throw new Error(`Invitation email provider returned HTTP ${response.status}. Retry the same invitation.`);
  const accepted: unknown = await response.json();
  if (!accepted || typeof accepted !== 'object' || !('id' in accepted) || typeof accepted.id !== 'string' || !accepted.id) {
    throw new Error('Email acceptance could not be confirmed. Retry the same invitation.');
  }
  return accepted.id;
}
