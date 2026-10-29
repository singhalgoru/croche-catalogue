import content from '../content/artisanOnboarding.json';
import { loadSupabase } from '../lib/supabaseConfig';
import { requestCartCaptcha } from './cartCaptcha';
import { convertImageForUpload } from '../utils/imageUploadConversion';

export const artisanStatuses = ['New', 'Contacted', 'Trial', 'Approved', 'Declined', 'Inactive'] as const;
export type ArtisanStatus = typeof artisanStatuses[number];
export interface ArtisanDetails {
  fullName: string;
  mobile: string;
  city: string;
  state: string;
  pin: string;
  language: string;
  skills: string;
  availability: string;
  experience: string;
  tools: string;
  portfolioUrl: string;
  notes: string;
  adult: boolean;
  consent: boolean;
  paidTrial: boolean;
}
export interface ArtisanApplication {
  id: string;
  details: ArtisanDetails;
  status: ArtisanStatus;
  admin_notes: string;
  version: number;
  created_at: string;
  updated_at: string;
  consent_version: string;
  dispatch_terms_version?: string | null;
  dispatch_terms_accepted_at?: string | null;
  identity_type?: 'masked_aadhaar' | 'alternative_id' | null;
  identity_expires_at?: string | null;
}
export interface ArtisanIdentityUpload {
  documentType: 'masked_aadhaar' | 'alternative_id';
  contentType: 'image/webp';
  data: string;
  consent: true;
}
export async function prepareArtisanIdentity(file: File, documentType: ArtisanIdentityUpload['documentType']): Promise<ArtisanIdentityUpload> {
  if (!file.size || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose one JPG, PNG or WebP ID photo up to 5 MB. PDF and other documents are not accepted.');
  }
  const prepared = await convertImageForUpload(file, { watermark: false });
  if (prepared.size > 1024 * 1024) throw new Error('The prepared ID image exceeds 1 MB. Choose a smaller, readable image.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/webp;base64,')) {
        reject(new Error('Unable to prepare the ID photo. Choose it again.')); return;
      }
      resolve(reader.result.slice('data:image/webp;base64,'.length));
    };
    reader.onerror = () => reject(new Error('Unable to read the ID photo. Choose it again.'));
    reader.readAsDataURL(prepared);
  });
  return { documentType, contentType: 'image/webp', data, consent: true };
}
export interface ArtisanHistory {
  id: number;
  action: string;
  old_status: string | null;
  new_status: string;
  created_at: string;
}
export const emptyArtisanDetails: ArtisanDetails = {
  fullName: '', mobile: '', city: '', state: '', pin: '', language: '', skills: '', availability: '',
  experience: '', tools: '', portfolioUrl: '', notes: '', adult: false, consent: false, paidTrial: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isDetails(value: unknown): value is ArtisanDetails {
  return isRecord(value) && content.fields.every(field => typeof value[field.name] === 'string')
    && typeof value.adult === 'boolean' && typeof value.consent === 'boolean' && typeof value.paidTrial === 'boolean';
}
function isApplication(value: unknown): value is ArtisanApplication {
  return isRecord(value) && typeof value.id === 'string' && isDetails(value.details)
    && artisanStatuses.some(status => status === value.status) && typeof value.admin_notes === 'string'
    && typeof value.version === 'number' && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string' && typeof value.consent_version === 'string'
    && ['dispatch_terms_version', 'dispatch_terms_accepted_at', 'identity_expires_at'].every(key =>
      value[key] == null || typeof value[key] === 'string')
    && (value.identity_type == null || value.identity_type === 'masked_aadhaar' || value.identity_type === 'alternative_id');
}
export function validateArtisanDetails(details: ArtisanDetails): void {
  for (const field of content.fields) {
    const value = Reflect.get(details, field.name);
    if (typeof value !== 'string' || (field.required && !value.trim()) || value.trim().length > field.maxLength) {
      throw new Error(`Check ${field.label.toLowerCase()} (maximum ${field.maxLength} characters).`);
    }
  }
  if (!/^(?:\+?91[\s-]?)?[6-9]\d{9}$/.test(details.mobile.trim())) {
    throw new Error('Enter a valid Indian mobile number, with optional +91 prefix.');
  }
  if (!/^[1-9]\d{5}$/.test(details.pin.trim())) throw new Error('Enter a valid six-digit Indian PIN code.');
  if (details.portfolioUrl.trim()) {
    let url: URL;
    try { url = new URL(details.portfolioUrl.trim()); }
    catch { throw new Error('Enter a complete public portfolio link starting with https://.'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Use an https:// portfolio link without embedded credentials.');
    }
  }
  if (!details.adult || !details.consent) throw new Error('Confirm you are 18 or older and agree to the application privacy notice.');
}
async function client() {
  const result = await loadSupabase();
  if (!result) throw new Error('Artisan applications require an online connection.');
  return result;
}
export async function submitArtisanApplication(details: ArtisanDetails, requestId: string, token: string,
  dispatchAcknowledged = false, identity: ArtisanIdentityUpload | null = null): Promise<string> {
  validateArtisanDetails(details);
  if (!dispatchAcknowledged) throw new Error('Read and acknowledge the material dispatch and courier charge terms.');
  const db = await client();
  const { data: session, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw new Error(`Unable to restore the application session: ${sessionError.message}`);
  if (!session.session) {
    const captchaToken = await requestCartCaptcha();
    const { error } = await db.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
    if (error) throw new Error(`Unable to prepare the application: ${error.message}`);
  }
  const { data, error } = await db.rpc('submit_artisan_application', {
    request_id: requestId, application_details: details, privacy_version: content.consentVersion, invitation_token: token,
    dispatch_terms_version: content.dispatchTermsVersion, identity_document: identity,
  });
  if (error) throw new Error(`Unable to save the application: ${error.message}`);
  if (data !== requestId) throw new Error('Application receipt could not be confirmed. Retry without changing your details.');
  return data;
}
export async function readArtisanIdentity(id: string): Promise<{ source: string; expiresAt: string }> {
  const db = await client();
  const { data, error } = await db.rpc('read_artisan_identity_document', { application_id: id });
  if (error) throw new Error(`Unable to open ID: ${error.message}`);
  if (!isRecord(data) || data.contentType !== 'image/webp' || typeof data.data !== 'string'
    || data.data.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data) || typeof data.expiresAt !== 'string') {
    throw new Error('Invalid identity document response.');
  }
  return { source: `data:image/webp;base64,${data.data}`, expiresAt: data.expiresAt };
}
export async function removeArtisanIdentity(application: ArtisanApplication): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('remove_artisan_identity_document', {
    application_id: application.id, expected_version: application.version,
  });
  if (error) throw new Error(`Unable to remove ID: ${error.message}`);
  if (data !== application.id) throw new Error('ID removal could not be confirmed. Refresh before retrying.');
}
export async function checkArtisanInvitation(token: string): Promise<'available' | 'submitted' | 'unavailable'> {
  const db = await client();
  const { data, error } = await db.rpc('artisan_invitation_status', { invitation_token: token });
  if (error) throw new Error(`Unable to check invitation: ${error.message}`);
  if (data !== 'available' && data !== 'submitted' && data !== 'unavailable') throw new Error('Invalid invitation response.');
  return data;
}
export interface ArtisanInvitation {
  id: string;
  recipient_name: string;
  channel: 'email' | 'whatsapp';
  contact: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  submitted_at: string | null;
  email_accepted_at: string | null;
}
export interface InvitationInput {
  id: string;
  token: string;
  name: string;
  channel: 'email' | 'whatsapp';
  contact: string;
}
export async function createArtisanInvitation(input: InvitationInput): Promise<{ link: string; message: string }> {
  const db = await client();
  const { data, error } = await db.functions.invoke('artisan-invitations', { body: input });
  if (error) {
    if (error.context instanceof Response) {
      const payload: unknown = await error.context.clone().json();
      if (isRecord(payload) && typeof payload.error === 'string') throw new Error(payload.error);
    }
    throw new Error(`Unable to create invitation: ${error.message}`);
  }
  if (!isRecord(data) || typeof data.link !== 'string' || typeof data.message !== 'string'
    || data.link !== `https://luviacreations.com/artisans/#invite=${input.token}`) throw new Error('Invalid invitation receipt.');
  return { link: data.link, message: data.message };
}
export async function fetchArtisanInvitations(): Promise<ArtisanInvitation[]> {
  const db = await client();
  const { data, error } = await db.from('artisan_invitations')
    .select('id,recipient_name,channel,contact,created_at,expires_at,revoked_at,submitted_at,email_accepted_at')
    .order('created_at', { ascending: false }).limit(25);
  if (error) throw new Error(`Unable to load invitations: ${error.message}`);
  if (!Array.isArray(data) || !data.every((row): row is ArtisanInvitation => isRecord(row)
    && typeof row.id === 'string' && typeof row.recipient_name === 'string' && typeof row.contact === 'string'
    && (row.channel === 'email' || row.channel === 'whatsapp') && typeof row.created_at === 'string'
    && typeof row.expires_at === 'string' && [row.revoked_at, row.submitted_at, row.email_accepted_at]
      .every(value => value === null || typeof value === 'string'))) throw new Error('Invalid invitation directory.');
  return data;
}
export async function revokeArtisanInvitation(id: string): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('revoke_artisan_invitation', { invitation_id: id });
  if (error) throw new Error(`Unable to revoke invitation: ${error.message}`);
  if (data !== id) throw new Error('Invalid invitation revocation receipt.');
}
export async function fetchArtisanApplications(search: string, status: string, page: number): Promise<{ applications: ArtisanApplication[]; total: number }> {
  const db = await client();
  const { data, error } = await db.rpc('list_artisan_applications', { search_text: search, status_filter: status, page_number: page });
  if (error) throw new Error(`Unable to load artisans: ${error.message}`);
  if (!isRecord(data) || !Array.isArray(data.applications) || !data.applications.every(isApplication)
    || typeof data.total !== 'number') throw new Error('Invalid artisan directory response.');
  return { applications: data.applications, total: data.total };
}
export async function updateArtisanApplication(application: ArtisanApplication, status: ArtisanStatus, notes: string): Promise<ArtisanApplication> {
  const db = await client();
  const { data, error } = await db.rpc('update_artisan_application', {
    application_id: application.id, expected_version: application.version, next_status: status, review_notes: notes,
  });
  if (error) throw new Error(`Unable to update artisan: ${error.message}`);
  if (!isApplication(data)) throw new Error('Invalid artisan update receipt. Refresh before retrying.');
  return data;
}
export async function fetchArtisanHistory(id: string): Promise<ArtisanHistory[]> {
  const db = await client();
  const { data, error } = await db.from('artisan_application_history')
    .select('id,action,old_status,new_status,created_at').eq('application_id', id).order('id', { ascending: false });
  if (error) throw new Error(`Unable to load artisan history: ${error.message}`);
  if (!Array.isArray(data) || !data.every((row): row is ArtisanHistory => isRecord(row)
    && typeof row.id === 'number' && typeof row.action === 'string'
    && (row.old_status === null || typeof row.old_status === 'string')
    && typeof row.new_status === 'string' && typeof row.created_at === 'string')) throw new Error('Invalid artisan history response.');
  return data;
}
export async function deleteArtisanApplication(application: ArtisanApplication): Promise<void> {
  const db = await client();
  const { data, error } = await db.rpc('delete_artisan_application', {
    application_id: application.id, expected_version: application.version,
  });
  if (error) throw new Error(`Unable to delete artisan application: ${error.message}`);
  if (data !== application.id) throw new Error('Deletion could not be confirmed. Refresh the directory before retrying.');
}
