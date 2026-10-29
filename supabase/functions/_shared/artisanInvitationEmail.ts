const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function buildArtisanInvitationEmail(name: string, link: string, expiresAt: string) {
  const expiry = new Date(expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' });
  const text = `Hello ${name},\n\nLuvia Creations invites you to share your crochet and handmade skills for possible home-based, batch-by-batch work.\n\nComplete your private application: ${link}\n\nThis single-use link expires on ${expiry}. Keep it private; anyone with it can submit the application. No account is needed.\n\nApplying does not guarantee work. We start with a small paid trial with no application fee or trial deposit. Rates, scope and deadlines are agreed before work starts. Do not send identity documents or bank details in the application.\n\nIf you were not expecting this invitation, you can ignore it. Questions or privacy requests: hello@luviacreations.com.\n\nWith love,\nLuvia Creations`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#fffaf0;color:#604239;font-family:Arial,sans-serif">
  <main style="max-width:560px;margin:24px auto;padding:24px;background:white;border-radius:20px;line-height:1.7">
  <img src="https://luviacreations.com/images/luvia-logo-160.webp" alt="Luvia Creations" width="80" height="80">
  <h1>Create with Luvia</h1><p>Hello ${escapeHtml(name)},</p>
  <p>We invite you to share your crochet and handmade skills for possible home-based, batch-by-batch work.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#604239;color:#fffaf0;border-radius:24px">Complete your artisan application</a></p>
  <p>This single-use link expires on ${escapeHtml(expiry)}. Keep it private; anyone with it can submit the application. No account is needed.</p>
  <p>Applying does not guarantee work. We start with a small paid trial with no application fee or trial deposit. Rates, scope and deadlines are agreed before work starts. Do not send identity documents or bank details in the application.</p>
  <p>If you were not expecting this invitation, you can ignore it. Questions or privacy requests: <a href="mailto:hello@luviacreations.com">hello@luviacreations.com</a>.</p>
  <p>With love,<br>Luvia Creations</p></main></body></html>`;
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
