import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminMfa from './AdminMfa';
const { listFactors, enroll, unenroll, verify } = vi.hoisted(() => ({
  listFactors: vi.fn(), enroll: vi.fn(), unenroll: vi.fn(), verify: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: {
  auth: { mfa: { listFactors, enroll, unenroll, challengeAndVerify: verify } },
} }));
beforeEach(() => {
  vi.clearAllMocks();
  listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
  enroll.mockResolvedValue({ data: { id: 'factor', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+' } }, error: null });
  unenroll.mockResolvedValue({ error: null });
  verify.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);
it('sets up an authenticator explicitly and unlocks only after verification', async () => {
  const unlocked = vi.fn().mockResolvedValue(undefined);
  render(<AdminMfa onVerified={unlocked} onSignOut={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
  expect(await screen.findByAltText('Authenticator setup QR code')).toBeTruthy();
  expect(enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp', issuer: 'Luvia Creations' }));
  expect(unlocked).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  await vi.waitFor(() => expect(unlocked).toHaveBeenCalledTimes(1));
  expect(verify).toHaveBeenCalledWith({ factorId: 'factor', code: '123456' });
});
it('asks for the existing authenticator without enrolling a replacement', async () => {
  listFactors.mockResolvedValue({ data: { totp: [{ id: 'existing' }], all: [] }, error: null });
  const unlocked = vi.fn();
  verify.mockResolvedValue({ error: new Error('Invalid authenticator code') });
  render(<AdminMfa onVerified={unlocked} onSignOut={vi.fn()} />);
  const code = await screen.findByLabelText('Six-digit code');
  fireEvent.change(code, { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Invalid authenticator code');
  expect(enroll).not.toHaveBeenCalled(); expect(unlocked).not.toHaveBeenCalled();
});
it('shows factor-loading failures and allows sign out without opening the console', async () => {
  listFactors.mockResolvedValue({ error: { message: 'Network unavailable' } });
  const signOut = vi.fn();
  render(<AdminMfa onVerified={vi.fn()} onSignOut={signOut} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
});
