// @vitest-environment node
import { expect, it } from 'vitest';
import { buildArtisanInvitationEmail } from './artisanInvitationEmail';

it('centers the logo and shows the onboarding flow in both email formats', () => {
  const email = buildArtisanInvitationEmail('<Maker>', 'https://luviacreations.com/artisans/#invite=token', '2026-11-02T00:00:00Z');
  expect(email.html).toContain('align="center"');
  expect(email.html).toContain('margin:0 auto');
  expect(email.html).toContain('aria-label="Onboarding process"');
  expect(email.html).toContain('<strong>Review</strong>');
  expect(email.html).toContain('&darr;');
  expect(email.text).toContain('Onboarding process:');
  expect(email.text).toContain('4. Agree a paid trial:');
  expect(email.html).toContain('&lt;Maker&gt;');
  expect(email.html).not.toContain('<p>Hello <Maker>');
});
