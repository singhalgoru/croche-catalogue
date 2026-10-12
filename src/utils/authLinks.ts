/** Recovery and admin invitation links both require choosing a password. */
export function isPasswordRecoveryLink(hash: string) {
  const type = new URLSearchParams(hash.replace(/^#/, '')).get('type');
  return type === 'recovery' || type === 'invite';
}
