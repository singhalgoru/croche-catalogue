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
    ['Apply', 'Share a little about your craft and experience.'],
    ['Private review', 'Our team reviews your application.'],
    ['Email update', 'We will email you with a decision or any questions.'],
    ['Paid trial', 'If selected, agree on the batch, rate and timing before work begins.'],
  ];
  const processText = `Your steps at a glance:\n${steps.map(([title, description], index) => `${index + 1}. ${title}: ${description}`).join('\n')}`;
  const processHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffaf0" style="width:100%;background:#fffaf0;border:1px solid #eee3d7;border-radius:14px">
    <tr><td colspan="2" style="padding:20px 20px 12px"><h2 style="margin:0;color:#604239;font-size:19px;line-height:1.3">Your steps at a glance</h2>
    <p style="margin:5px 0 0;color:#806a60;font-size:13px;line-height:1.5">A simple, personal process — no account or fee to apply.</p></td></tr>
    ${steps.map(([title, description], index) => `<tr>
      <td width="60" align="center" valign="top" style="width:60px;padding:12px 0 0 14px">
        <table role="presentation" width="34" cellspacing="0" cellpadding="0" border="0" bgcolor="${index === steps.length - 1 ? '#604239' : '#f2d9d8'}" style="width:34px;border-radius:50%">
          <tr><td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;color:${index === steps.length - 1 ? '#ffffff' : '#604239'};font-size:14px;font-weight:bold">${index + 1}</td></tr>
        </table>
      </td>
      <td valign="top" style="padding:12px 18px 0 10px;line-height:1.5">
        <strong style="color:#604239;font-size:15px">${title}</strong><br>
        <span style="color:#715e55;font-size:13px">${description}</span>
      </td>
    </tr>
    ${index < steps.length - 1 ? '<tr><td width="60" align="center" style="width:60px;padding:1px 0 0 14px;color:#c28c8b;font-size:15px;line-height:16px">&darr;</td><td style="height:1px;font-size:1px;line-height:1px">&nbsp;</td></tr>' : ''}`).join('')}
    <tr><td colspan="2" height="18" style="height:18px;font-size:1px;line-height:1px">&nbsp;</td></tr>
    </table>`;
  const safeLink = escapeHtml(link);
  const text = `Hello ${safeName},\n\nLuvia Creations invites you to share your crochet and handmade skills for possible home-based, batch-by-batch work.\n\nComplete your private application: ${link}\n\n${processText}\n\nThis link expires 24 hours after creation (${expiry}) or after one submission, whichever comes first. Keep it private; anyone with it can submit the application. No account is needed.\n\n${terms}\n\nIf you were not expecting this invitation, you can ignore it. Questions or privacy requests: hello@luviacreations.com.\n\nWith love,\nLuvia Creations`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;width:100%;background:#f5eee8;color:#604239;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">A personal invitation to apply for home-based, batch-by-batch crochet work with Luvia Creations.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5eee8" style="width:100%;background:#f5eee8">
  <tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #eee5de;border-radius:18px;overflow:hidden">
  <tr><td align="center" bgcolor="#ffffff" style="padding:28px 24px 20px;background:#ffffff">
  <a href="https://luviacreations.com/" style="display:inline-block;text-decoration:none">
    <img src="https://luviacreations.com/images/luvia-logo-480.webp" alt="Luvia Creations — made with love" width="128" height="128" style="display:block;width:128px;height:128px;margin:0 auto;border:0;border-radius:50%">
  </a>
  <p style="margin:16px 0 6px;color:#a47772;font-size:11px;font-weight:bold;letter-spacing:2px;line-height:1.4;text-align:center">CREATE WITH LUVIA</p>
  <h1 style="margin:0;color:#604239;font-size:28px;line-height:1.25;text-align:center">A little invitation to create</h1>
  </td></tr>
  <tr><td style="padding:4px 32px 32px;line-height:1.65">
  <p style="margin:0 0 14px;font-size:16px">Hello ${escapeHtml(safeName)},</p>
  <p style="margin:0 0 22px;color:#715e55;font-size:15px">We would love to learn about your crochet and handmade skills for possible home-based, batch-by-batch work.</p>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 12px"><tr><td align="center" bgcolor="#604239" style="border-radius:28px">
    <a href="${safeLink}" style="display:inline-block;padding:14px 26px;border:1px solid #604239;border-radius:28px;background:#604239;color:#ffffff;font-size:15px;font-weight:bold;line-height:1.2;text-align:center;text-decoration:none">Complete your application</a>
  </td></tr></table>
  <p style="margin:0 0 24px;color:#8b7770;font-size:12px;line-height:1.5;text-align:center">Private link · No account needed · No application fee</p>
  ${processHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fbf4ed" style="width:100%;margin:0 0 20px;background:#fbf4ed;border-left:3px solid #c88d8c">
    <tr><td style="padding:14px 16px">
      <p style="margin:0 0 4px;color:#604239;font-size:14px;font-weight:bold">Your invitation link is time-limited</p>
      <p style="margin:0;color:#715e55;font-size:13px;line-height:1.55">It expires 24 hours after creation (${escapeHtml(expiry)}) or after one submission, whichever comes first. Keep it private — anyone with the link can submit an application.</p>
    </td></tr>
  </table>
  <p style="margin:0 0 8px;color:#604239;font-size:13px;font-weight:bold">A few things to know</p>
  <p style="margin:0 0 16px;color:#715e55;font-size:13px;line-height:1.6">${escapeHtml(terms)}</p>
  <p style="margin:0 0 16px;color:#715e55;font-size:13px;line-height:1.6">Button not working? Copy this private link into your browser:<br><a href="${safeLink}" style="color:#79534d;overflow-wrap:anywhere;word-break:break-all">${safeLink}</a></p>
  <p style="margin:0;color:#715e55;font-size:13px;line-height:1.6">If you were not expecting this invitation, you can ignore it. Questions or privacy requests: <a href="mailto:hello@luviacreations.com" style="color:#79534d">hello@luviacreations.com</a>.</p>
  </td></tr>
  <tr><td align="center" bgcolor="#fbf7f2" style="padding:18px 24px;background:#fbf7f2;border-top:1px solid #eee5de">
    <p style="margin:0;color:#806a60;font-size:13px;line-height:1.5">With love,<br><strong style="color:#604239">Luvia Creations</strong></p>
    <p style="margin:8px 0 0;color:#a08d84;font-size:11px">Handmade with care in India</p>
  </td></tr></table>
  <p style="margin:14px 0 0;color:#9b8981;font-size:11px;line-height:1.5;text-align:center">This invitation was sent by Luvia Creations to ${escapeHtml(safeName)}.</p>
  </td></tr></table></body></html>`;
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
