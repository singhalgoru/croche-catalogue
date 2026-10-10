/** True when the page was opened from a Supabase password-reset email link. */
export function isPasswordRecoveryLink(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery';
}
