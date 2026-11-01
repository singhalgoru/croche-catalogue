export type ArtisanApplicationEmailKind = 'submitted' | 'Trial' | 'Approved' | 'Declined' | 'More information required';

export interface ArtisanApplicationEmailJob {
  id: string;
  kind: ArtisanApplicationEmailKind;
  recipient_email: string;
  payload: {
    application_id: string;
    applicant_name: string;
    applicant_email: string;
    mobile: string;
    city: string;
    state: string;
    skills: string;
    availability: string;
    message: string;
  };
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailText = (text: string) => Array.from(text).filter(char => {
  const code = char.codePointAt(0)!;
  return code >= 32 && code !== 127;
}).join('').replace(/\s+/g, ' ').trim();

const onboardingSteps = [
  ['1. Apply', 'Share your craft and contact details.'],
  ['2. Review', 'Luvia reviews your application privately.'],
  ['3. Email update', 'Receive a decision or a request for more information.'],
  ['4. Agree a paid trial', 'Set batch scope, rate and timing before work begins.'],
  ['5. Post-trial decision', 'After reviewing your completed paid trial, Luvia approves or declines your application.'],
] as const;
const onboardingFlowText = [
  'Onboarding process:',
  ...onboardingSteps.map(([title, description]) => `${title}: ${description}`),
].join('\n');
const onboardingFlowHtml = (activeIndex = -1) => `<section aria-label="Onboarding process" style="margin:20px 0;padding:16px;background:#fffaf0;border:1px solid #e8dcc5;border-radius:12px">
  <h2 style="margin:0 0 12px;font-size:18px">Onboarding process</h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  ${onboardingSteps.map(([title, description], index) => `<tr${index === activeIndex ? ' bgcolor="#f6ead7"' : ''}><td width="36" valign="top" style="padding:6px 8px 6px ${index === activeIndex ? '8px' : '0'};color:#604239;font-weight:bold">${index + 1}.</td>
    <td style="padding:6px 8px 6px 0;line-height:1.5"><strong>${escapeHtml(title.slice(3))}</strong>${index === activeIndex ? ' <span style="display:inline-block;padding:1px 8px;background:#604239;color:#fffaf0;border-radius:10px;font-size:11px;font-weight:bold">YOU ARE HERE</span>' : ''}<br>${escapeHtml(description)}</td></tr>
    ${index < onboardingSteps.length - 1 ? '<tr><td colspan="2" align="center" aria-hidden="true" style="height:16px;color:#8b6b51">&darr;</td></tr>' : ''}`).join('')}
  </table></section>`;

export function buildArtisanApplicationEmail(job: ArtisanApplicationEmailJob) {
  const { payload } = job;
  const applicantName = emailText(payload.applicant_name);
  const applicantEmail = emailText(payload.applicant_email);
  const mobile = emailText(payload.mobile);
  const city = emailText(payload.city);
  const state = emailText(payload.state);
  const skills = emailText(payload.skills);
  const availability = emailText(payload.availability);
  const message = payload.message.replace(/\r\n?/g, '\n').split('\n').map(emailText).join('\n').trim();
  const isSubmission = job.kind === 'submitted';
  const isInformationRequest = job.kind === 'More information required';
  const subject = isSubmission ? `New artisan application to review - ${applicantName} - Luvia Creations`
    : job.kind === 'Trial' ? 'Welcome to Luvia Creations - your paid trial is next'
    : job.kind === 'Approved' ? 'Welcome to Luvia Creations - welcome to the Luvia family!'
      : job.kind === 'Declined' ? 'An update on your Luvia artisan application'
        : 'More information needed for your Luvia artisan application';
  const heading = isSubmission ? 'New artisan application'
    : job.kind === 'Trial' ? 'Welcome to Luvia'
    : job.kind === 'Approved' ? 'Welcome to the Luvia family!'
      : job.kind === 'Declined' ? 'An update on your application'
        : 'A little more information, please';
  const paragraphs = isSubmission ? [
    `A new artisan application has been submitted by ${applicantName}.`,
    `Applicant email: ${applicantEmail || 'Not provided'}`,
    `Mobile / WhatsApp: ${mobile}`,
    `Location: ${city}, ${state}`,
    `Skills: ${skills}`,
    `Availability: ${availability}`,
    'Please review the private application in the admin console.',
  ] : job.kind === 'Trial' ? [
    `Hello ${applicantName},`,
    'Welcome to Luvia Creations! Thank you for sharing your craft with us. We loved your application and would like to invite you to a small paid trial.',
    'We will contact you shortly to agree the trial piece, rate, quality requirements, delivery costs and timeline. Please do not start any work until these details are confirmed with you.',
    'The trial is not a promise of ongoing work; it helps us both see whether working together is a good fit.',
  ] : job.kind === 'Approved' ? [
    `Hello ${applicantName},`,
    'Thank you for completing your paid trial with Luvia Creations. Following our review of your trial work, your artisan application has been approved. Welcome to the Luvia family!',
    'At Luvia, every handmade piece carries the care and skill of the artisan behind it. Thank you for choosing to share your craft with us; we look forward to creating beautiful things together.',
    'What happens next: Our team will contact you about suitable upcoming batches and agree the next steps. For each new batch, please wait for confirmation of the scope, rates, quality requirements, delivery costs and timelines before starting work.',
    'This approval is not a work agreement or a guarantee of ongoing work. All work and payment terms will be agreed with you separately.',
  ] : job.kind === 'Declined' ? [
    `Hello ${applicantName},`,
    'Thank you for completing your paid trial and sharing your work with Luvia Creations. After reviewing your trial work, we are unable to approve your application or continue with further batches at this time.',
    'We appreciate your interest and wish you the very best with your craft.',
  ] : [
    `Hello ${applicantName},`,
    'Thank you for your artisan application. We need a little more information before we can continue reviewing it:',
    message,
    'Please reply to this email with the requested information. Do not send identity documents, bank details, passwords or OTPs.',
  ];
  const text = [
    'Luvia Creations - Create with Luvia',
    heading,
    '',
    ...paragraphs.map((paragraph, index) => isInformationRequest && index === 2
      ? `DETAILS WE NEED FROM YOU:\n${paragraph}` : paragraph),
    '',
    ...(!isSubmission ? [onboardingFlowText, ''] : []),
    ...(isSubmission ? [
      `Application reference: ${payload.application_id}`,
      'Open the admin console: https://luviacreations.com/#admin',
      'This private notice is for application review; do not forward it.',
      '',
    ] : []),
    'Questions: info@luviacreations.com',
    '',
    'With love,',
    'Luvia Creations',
  ].join('\n');
  const htmlParagraphs = paragraphs.map((paragraph, index) => isInformationRequest && index === 2
    ? `<section aria-label="Details we need from you" style="margin:20px 0;padding:20px;background:#f6ead7;border:1px solid #d4ab58;border-left:5px solid #604239;border-radius:12px">
      <h2 style="margin:0 0 12px;color:#604239;font-size:20px;line-height:1.4">Details we need from you</h2>
      <p style="margin:0;color:#604239;font-size:17px;font-weight:bold;line-height:1.65;overflow-wrap:anywhere">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>
      <p style="margin:16px 0 0;font-size:14px;line-height:1.65"><strong>How to respond:</strong> Reply to this email with an answer to each requested detail above.</p>
      </section>`
    : `<p style="margin:0 0 16px;line-height:1.65;overflow-wrap:anywhere">${escapeHtml(paragraph)}</p>`).join('');
  const submissionDetails = isSubmission ? `<div style="margin:20px 0;padding:16px;background:#fffaf0;border-left:4px solid #d4ab58">
    <p style="margin:0 0 8px"><strong>Application reference:</strong> ${escapeHtml(payload.application_id)}</p>
    <p style="margin:0 0 8px"><strong>Email:</strong> ${escapeHtml(applicantEmail || 'Not provided')}</p>
    <p style="margin:0 0 8px"><strong>Mobile / WhatsApp:</strong> ${escapeHtml(mobile)}</p>
    <p style="margin:0 0 8px"><strong>Location:</strong> ${escapeHtml(city)}, ${escapeHtml(state)}</p>
    <p style="margin:0 0 8px"><strong>Skills:</strong> ${escapeHtml(skills)}</p>
    <p style="margin:0"><strong>Availability:</strong> ${escapeHtml(availability)}</p>
    </div><p style="margin:20px 0"><a href="https://luviacreations.com/#admin" style="display:inline-block;padding:12px 20px;background:#604239;color:#fffaf0;border-radius:24px;text-decoration:none">Open admin console</a></p>` : '';
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;width:100%;background:#fffaf0;color:#604239;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffaf0" style="width:100%;background:#fffaf0">
  <tr><td align="center" style="padding:0 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffaf0" style="width:100%;max-width:600px;background:#fffaf0;line-height:1.65">
  <tr><td align="center" style="padding:24px 16px 8px">
  <a href="https://luviacreations.com/" style="display:inline-block;text-decoration:none">  <img src="https://luviacreations.com/images/luvia-logo-480.webp" alt="Luvia Creations — made with love" width="128" height="128" style="display:block;width:128px;height:128px;margin:0 auto;border:0;border-radius:50%"></a>
    <p style="margin:16px 0 6px;color:#a47772;font-size:11px;font-weight:bold;letter-spacing:2px;line-height:1.4;text-align:center">CREATE WITH LUVIA</p>
    <h1 style="margin:0;text-align:center;color:#604239;font-size:26px;line-height:1.25">${escapeHtml(heading)}</h1>
  </td></tr><tr><td style="padding:8px 20px 24px">
  ${isSubmission ? `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(paragraphs[0])}</p>` : htmlParagraphs}
  ${isSubmission ? '' : onboardingFlowHtml(job.kind === 'Trial' ? 3 : -1)}
  ${submissionDetails}
  ${isSubmission ? `<p style="margin:0 0 16px;line-height:1.65">${escapeHtml(paragraphs.at(-1)!)}</p>
    <p style="margin:0 0 16px;line-height:1.65">This private notice is for application review; do not forward it.</p>` : ''}
  <p style="margin:24px 0 0;line-height:1.65">Questions: <a href="mailto:info@luviacreations.com" style="color:#604239">info@luviacreations.com</a></p>
  <p style="margin:16px 0 0">With love,<br>Luvia Creations</p>
  </td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendArtisanApplicationEmail(job: ArtisanApplicationEmailJob, apiKey: string): Promise<string> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipient_email)) throw new Error('Invalid artisan email recipient.');
  const email = buildArtisanApplicationEmail(job);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `artisan-application-${job.id}`,
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: 'Luvia Creations <onboarding@luviacreations.com>',
      to: [job.recipient_email],
      reply_to: job.kind === 'submitted' && emailPattern.test(job.payload.applicant_email)
        ? job.payload.applicant_email : 'info@luviacreations.com',
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!response.ok) throw new Error(`Artisan email provider returned HTTP ${response.status}.`);
  const accepted: unknown = await response.json();
  if (!accepted || typeof accepted !== 'object' || !('id' in accepted) || typeof accepted.id !== 'string' || !accepted.id) {
    throw new Error('Invalid artisan email provider confirmation.');
  }
  return accepted.id;
}
