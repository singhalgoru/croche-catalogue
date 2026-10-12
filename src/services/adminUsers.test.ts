import { beforeEach, expect, it, vi } from 'vitest';
import { changeAdminUser, fetchAdminUsers } from './adminUsers';
const { invoke, captcha } = vi.hoisted(() => ({ invoke: vi.fn(), captcha: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke } }) }));
vi.mock('./cartCaptcha', () => ({ requestCartCaptcha: captcha }));
beforeEach(() => { vi.clearAllMocks(); captcha.mockResolvedValue('captcha'); });
it('validates the directory payload rather than displaying invalid accounts', async () => {
  invoke.mockResolvedValue({ data: { isOwner: true, currentUserId: 'owner', users: [null] }, error: null });
  await expect(fetchAdminUsers()).rejects.toThrow('Invalid admin directory response');
});
it('requires password and attaches fresh CAPTCHA to mutation requests', async () => {
  await expect(changeAdminUser({ action: 'remove', id: 'member' }, '')).rejects.toThrow('current password');
  expect(invoke).not.toHaveBeenCalled();
  invoke.mockResolvedValue({ data: { message: 'Access removed.' }, error: null });
  await expect(changeAdminUser({ action: 'remove', id: 'member' }, 'current')).resolves.toBe('Access removed.');
  expect(invoke).toHaveBeenCalledWith('manage-admin-users', {
    body: { action: 'remove', id: 'member', currentPassword: 'current', captchaToken: 'captcha' },
  });
});
it('surfaces the backend error instead of generic function non-2xx failure', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Non-2xx', context: new Response(JSON.stringify({ error: 'Incorrect current password.' })) } });
  await expect(changeAdminUser({ action: 'remove', id: 'member' }, 'wrong')).rejects.toThrow('Incorrect current password.');
});
it('notifies the greeting only after a successful name edit', async () => {
  const listener = vi.fn();
  window.addEventListener('admin-account-updated', listener);
  try {
    invoke.mockResolvedValue({ data: { message: 'Name updated.' }, error: null });
    await changeAdminUser({ action: 'edit', id: 'owner', name: 'Updated Admin' }, 'current');
    expect(listener).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValue({ error: { message: 'Update failed' } });
    await expect(changeAdminUser({ action: 'edit', id: 'owner', name: 'Wrong' }, 'current')).rejects.toThrow('Update failed');
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('admin-account-updated', listener);
  }
});
