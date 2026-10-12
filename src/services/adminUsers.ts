import { loadSupabase } from '../lib/supabaseConfig';
import { requestCartCaptcha } from './cartCaptcha';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  verified: boolean;
  createdAt: string;
}
export interface AdminDirectory {
  isOwner: boolean;
  currentUserId: string;
  users: AdminUser[];
}
export type AdminUserChange =
  | { action: 'add'; email: string; name: string }
  | { action: 'edit'; id: string; name: string }
  | { action: 'remove'; id: string }
  | { action: 'password'; id: string; password: string };

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  const client = await loadSupabase();
  if (!client) throw new Error('Admin accounts require an online connection.');
  const { data, error } = await client.functions.invoke('manage-admin-users', { body });
  if (error) {
    if (error.context instanceof Response) {
      const payload: unknown = await error.context.clone().json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        throw new Error(payload.error);
      }
    }
    throw new Error(`Unable to manage admin accounts: ${error.message}`);
  }
  return data;
}
export async function fetchAdminUsers(): Promise<AdminDirectory> {
  const data = await invoke({ action: 'list' });
  if (!data || typeof data !== 'object' || !('isOwner' in data) || typeof data.isOwner !== 'boolean'
    || !('currentUserId' in data) || typeof data.currentUserId !== 'string'
    || !('users' in data) || !Array.isArray(data.users)
    || !data.users.every((user): user is AdminUser => user && typeof user.id === 'string'
      && typeof user.email === 'string' && typeof user.name === 'string'
      && typeof user.isOwner === 'boolean' && typeof user.verified === 'boolean' && typeof user.createdAt === 'string')) {
    throw new Error('Invalid admin directory response.');
  }
  return { isOwner: data.isOwner, currentUserId: data.currentUserId, users: data.users };
}
export async function changeAdminUser(change: AdminUserChange, currentPassword: string): Promise<string> {
  if (!currentPassword) throw new Error('Enter your current password to authorize this change.');
  const captchaToken = await requestCartCaptcha();
  const data = await invoke({ ...change, currentPassword, ...(captchaToken ? { captchaToken } : {}) });
  if (!data || typeof data !== 'object' || !('message' in data) || typeof data.message !== 'string') {
    throw new Error('Invalid admin update response. Refresh accounts before retrying.');
  }
  if (change.action === 'edit') window.dispatchEvent(new Event('admin-account-updated'));
  return data.message;
}
