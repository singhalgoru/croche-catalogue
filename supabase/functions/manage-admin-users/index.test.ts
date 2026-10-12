// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, getUser, signIn, signOut, invite, getById, update, insert } = vi.hoisted(() => ({
  rpc: vi.fn(), getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), invite: vi.fn(),
  getById: vi.fn(), update: vi.fn(), insert: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ rpc, from: () => ({ insert }),
    auth: { getUser, signInWithPassword: signIn, signOut,
      admin: { inviteUserByEmail: invite, getUserById: getById, updateUserById: update } } }),
}));
let handle: (request: Request) => Promise<Response>;
const owner = { id: 'owner', email: 'owner@example.test', email_confirmed_at: '2026-01-01', is_anonymous: false };
const member = { id: 'member', email: 'member@example.test', name: 'Member', isOwner: false, verified: true, createdAt: '' };
let directory: { isOwner: boolean; currentUserId: string; users: typeof member[] };
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://example.test' : 'fixture' },
    serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  directory = { isOwner: true, currentUserId: 'owner', users: [{ ...member, id: 'owner', isOwner: true }, member] };
  getUser.mockResolvedValue({ data: { user: owner }, error: null });
  rpc.mockImplementation(async (name: string) => ({
    data: name === 'admin_user_directory' ? directory : name === 'find_admin_candidate' ? null : undefined, error: null,
  }));
  signIn.mockResolvedValue({ data: { user: owner }, error: null });
  signOut.mockResolvedValue({ error: null });
  invite.mockResolvedValue({ data: { user: { id: 'invited' } }, error: null });
  getById.mockResolvedValue({ data: { user: { ...owner, id: 'member', user_metadata: { keep: true } } }, error: null });
  update.mockResolvedValue({ error: null }); insert.mockResolvedValue({ error: null });
});
const request = (body: unknown, auth = true) => new Request('https://example.test/manage', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
  body: JSON.stringify(body),
});
it('requires a verified admin and rejects public/non-admin access', async () => {
  expect((await handle(request({ action: 'list' }, false))).status).toBe(401);
  rpc.mockResolvedValue({ error: { message: 'not admin' } });
  expect((await handle(request({ action: 'list' }))).status).toBe(403);
  expect(invite).not.toHaveBeenCalled();
});
it('lists only the server-authorized directory without a password', async () => {
  expect(await (await handle(request({ action: 'list' }))).json()).toEqual(directory);
  expect(signIn).not.toHaveBeenCalled();
});
it.each(['add','edit','remove','password'])('denies non-owner %s on another admin', async action => {
  directory.isOwner = false;
  expect((await handle(request({ action, id: 'member' }))).status).toBe(403);
  expect(signIn).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
it('protects owner removal and requires current-password reauthentication', async () => {
  expect((await handle(request({ action: 'remove', id: 'owner', currentPassword: 'fixture' }))).status).toBe(400);
  signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
  expect((await handle(request({ action: 'remove', id: 'member', currentPassword: 'wrong' }))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalledWith('manage_admin_membership', expect.anything());
});
it('invites a new account before granting admin access and forwards CAPTCHA only for reauthentication', async () => {
  const response = await handle(request({ action: 'add', email: 'NEW@example.test', name: 'New Admin',
    currentPassword: 'current', captchaToken: 'captcha' }));
  expect(response.status).toBe(200);
  expect(invite).toHaveBeenCalledWith('new@example.test', { data: { full_name: 'New Admin' }, redirectTo: 'https://luviacreations.com/' });
  expect(signIn).toHaveBeenCalledWith({ email: owner.email, password: 'current', options: { captchaToken: 'captcha' } });
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(rpc).toHaveBeenCalledWith('manage_admin_membership', { actor: 'owner', target: 'invited', grant_access: true });
});
it('surfaces invite delivery failure without granting access', async () => {
  invite.mockResolvedValue({ error: { message: 'SMTP rejected invitation' }, data: {} });
  const response = await handle(request({ action: 'add', email: 'new@example.test', name: 'New Admin', currentPassword: 'current' }));
  expect(await response.json()).toEqual({ error: 'SMTP rejected invitation' });
  expect(rpc).not.toHaveBeenCalledWith('manage_admin_membership', expect.anything());
});
it('preserves existing verified account credentials when granting admin access', async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === 'admin_user_directory' ? directory
    : name === 'find_admin_candidate' ? 'existing' : null, error: null }));
  expect((await handle(request({ action: 'add', email: 'existing@example.test', name: 'Admin', currentPassword: 'current' }))).status).toBe(200);
  expect(invite).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it('rejects unverified existing accounts without granting access', async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === 'admin_user_directory' ? directory : 'existing', error: null }));
  getById.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
  expect((await handle(request({ action: 'add', email: 'existing@example.test', name: 'Admin', currentPassword: 'current' }))).status).toBe(400);
});
it('edits names preserving unrelated metadata and records an audit', async () => {
  expect((await handle(request({ action: 'edit', id: 'member', name: 'Updated', currentPassword: 'current' }))).status).toBe(200);
  expect(update).toHaveBeenCalledWith('member', { user_metadata: { keep: true, full_name: 'Updated' } });
  expect(insert).toHaveBeenCalledWith({ actor_id: 'owner', target_id: 'member', action: 'edit' });
});
it('allows own password change but rejects weak passwords', async () => {
  directory.isOwner = false;
  expect((await handle(request({ action: 'password', id: 'owner', password: 'weak', currentPassword: 'current' }))).status).toBe(400);
  expect((await handle(request({ action: 'password', id: 'owner', password: 'StrongPassword123', currentPassword: 'current' }))).status).toBe(200);
  expect(update).toHaveBeenCalledWith('owner', { password: 'StrongPassword123' });
});
it('removes only admin access without deleting the Auth user', async () => {
  expect((await handle(request({ action: 'remove', id: 'member', currentPassword: 'current' }))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('manage_admin_membership', { actor: 'owner', target: 'member', grant_access: false });
  expect(update).not.toHaveBeenCalled();
});
it('denies a mutation when membership was revoked during reauthentication', async () => {
  let checks = 0;
  rpc.mockImplementation(async (name: string) => ({ data: name === 'admin_user_directory' && ++checks === 1 ? directory : null, error: null }));
  expect((await handle(request({ action: 'edit', id: 'member', name: 'Updated', currentPassword: 'current' }))).status).toBe(403);
  expect(update).not.toHaveBeenCalled();
});
it('reports partial success when audit recording fails after an Auth update', async () => {
  insert.mockResolvedValue({ error: { message: 'Audit unavailable' } });
  const response = await handle(request({ action: 'edit', id: 'member', name: 'Updated', currentPassword: 'current' }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('Account updated, but audit recording failed');
});
