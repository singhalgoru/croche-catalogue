// @vitest-environment node
import { expect, it } from 'vitest';
import { buildArtisanInvitationEmail } from './artisanInvitationEmail';

it('uses a polished branded layout and clearly presents the onboarding flow', () => {
  const email = buildArtisanInvitationEmail('<Maker>', 'https://luviacreations.com/artisans/#invite=token', '2026-11-02T00:00:00Z');
  expect(email.html).toContain('src="https://luviacreations.com/images/luvia-logo-480.webp"');
  expect(email.html).toContain('width="128" height="128"');
  expect(email.html).toContain('alt="Luvia Creations — made with love"');
  expect(email.html).toContain('A little invitation to create');
  expect(email.html).toContain('Complete your application');
  expect(email.html).toContain('Your steps at a glance');
  expect(email.html).toContain('<strong style="color:#604239;font-size:15px">Private review</strong>');
  expect(email.html).toContain('<strong style="color:#604239;font-size:15px">Paid trial</strong>');
  expect(email.html.match(/&darr;/g)).toHaveLength(3);
  expect(email.html).toContain('Button not working? Copy this private link');
  expect(email.text).toContain('Your steps at a glance:');
  expect(email.text).toContain('4. Paid trial:');
  expect(email.text).toContain('anyone with it can submit the application');
  expect(email.html).toContain('&lt;Maker&gt;');
  expect(email.html).not.toContain('<p>Hello <Maker>');
});
