import { expect, it } from 'vitest';
import { isPasswordRecoveryLink } from './authLinks';

it('recognises Supabase password-reset and admin invitation links', () => {
  expect(isPasswordRecoveryLink('#access_token=abc&type=recovery&expires_in=3600')).toBe(true);
  expect(isPasswordRecoveryLink('#access_token=abc&type=invite&expires_in=3600')).toBe(true);
  expect(isPasswordRecoveryLink('#access_token=abc&type=email_change')).toBe(false);
  expect(isPasswordRecoveryLink('#product-rose-charm')).toBe(false);
  expect(isPasswordRecoveryLink('')).toBe(false);
});