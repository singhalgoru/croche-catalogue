import { loadSupabase } from '../lib/supabaseConfig';
import { convertImageForUpload, createResizedWebp } from '../utils/imageUploadConversion';
import { localDate } from '../utils/date';

export interface Testimonial {
  id: string;
  display_name: string;
  quote: string;
  product_ids: string[];
  has_image: boolean;
  image_url: string | null;
  image_alt: string;
  featured: boolean;
  sort_order: number;
}
export interface AdminTestimonial extends Testimonial {
  published: boolean;
  consent_confirmed: boolean;
  consent_date: string | null;
  consent_source: string;
  version: number;
}
export interface CustomerLoveRepository {
  list: () => Promise<AdminTestimonial[]>;
  photo: (id: string) => Promise<string | null>;
  save: (entry: AdminTestimonial, photo: string | null) => Promise<void>;
  remove: (entry: AdminTestimonial) => Promise<void>;
  syncPhotos: (id?: string) => Promise<void>;
}
export const newTestimonial = (): AdminTestimonial => ({
  id: crypto.randomUUID(), display_name: '', quote: '', product_ids: [], has_image: false, image_url: null, image_alt: '',
  featured: false, sort_order: 0, published: false, consent_confirmed: false, consent_date: null,
  consent_source: '', version: 0,
});
export function isTestimonial(value: unknown): value is Testimonial {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.display_name === 'string' && typeof item.quote === 'string'
    && Array.isArray(item.product_ids) && item.product_ids.every(id => typeof id === 'string') && typeof item.has_image === 'boolean'
    && (item.image_url === null || (typeof item.image_url === 'string' && item.image_url.startsWith('https://')))
    && typeof item.image_alt === 'string' && typeof item.featured === 'boolean'
    && Number.isInteger(item.sort_order);
}
function isAdminTestimonial(value: unknown): value is AdminTestimonial {
  if (!isTestimonial(value)) return false;
  return 'published' in value && typeof value.published === 'boolean'
    && 'consent_confirmed' in value && typeof value.consent_confirmed === 'boolean'
    && 'consent_date' in value && (value.consent_date === null || typeof value.consent_date === 'string')
    && 'consent_source' in value && typeof value.consent_source === 'string'
    && 'version' in value && typeof value.version === 'number';
}
async function client() {
  const result = await loadSupabase();
  if (!result) throw new Error('Customer Love requires an online database connection.');
  return result;
}
export async function fetchTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await (await client()).rpc('list_customer_love', { admin_view: false });
  if (error) throw error;
  if (!Array.isArray(data) || !data.every(isTestimonial)) throw new Error('Invalid Customer Love response.');
  return data;
}
export const customerLoveRepository: CustomerLoveRepository = {
  async list() {
    const { data, error } = await (await client()).rpc('list_customer_love', { admin_view: true });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isAdminTestimonial)) throw new Error('Invalid admin testimonial response.');
    return data;
  },
  async photo(id) {
    const { data, error } = await (await client()).rpc('customer_love_photo', { testimonial_id: id, admin_view: true });
    if (error) throw error;
    if (data !== null && typeof data !== 'string') throw new Error('Invalid testimonial photo response.');
    return data ? `data:image/webp;base64,${data}` : null;
  },
  async save(entry, photo) {
    validateTestimonial(entry);
    const { data, error } = await (await client()).rpc('save_customer_love', {
      testimonial_id: entry.id, expected_version: entry.version, entry, photo_base64: photo,
    });
    if (error) throw error;
    if (data !== entry.id) throw new Error('Testimonial save was not confirmed.');
  },
  async remove(entry) {
    const { data, error } = await (await client()).rpc('delete_customer_love', {
      testimonial_id: entry.id, expected_version: entry.version,
    });
    if (error) throw error;
    if (data !== entry.id) throw new Error('Testimonial deletion was not confirmed.');
  },
  async syncPhotos(id) {
    const { error } = await (await client()).functions.invoke('customer-love-photos', { body: id ? { id } : {} });
    if (error) throw new Error(await functionErrorMessage(error, 'Unable to update the public photo in R2.'));
  },
};
async function functionErrorMessage(error: { message: string; context?: unknown }, fallback: string) {
  if (error.context instanceof Response) {
    const body: unknown = await error.context.clone().json().catch(() => null);
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  }
  return error.message || fallback;
}
export function validateTestimonial(entry: AdminTestimonial) {
  if (!entry.display_name.trim() || entry.display_name.trim().length > 80
    || entry.quote.trim().length < 10 || entry.quote.trim().length > 1000) {
    throw new Error('Enter a display name and a quote between 10 and 1,000 characters.');
  }
  if (!Number.isInteger(entry.sort_order) || entry.sort_order < 0 || entry.sort_order > 9999) {
    throw new Error('Display order must be a whole number between 0 and 9,999.');
  }
  if (entry.has_image && (!entry.image_alt.trim() || entry.image_alt.length > 200)) {
    throw new Error('Describe the photo for visitors using a screen reader (up to 200 characters).');
  }
  if (entry.consent_source.length > 300) throw new Error('Consent source must be 300 characters or fewer.');
  if (entry.consent_date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.consent_date)
    || Number.isNaN(Date.parse(entry.consent_date))
    || new Date(entry.consent_date).toISOString().slice(0, 10) !== entry.consent_date || entry.consent_date > localDate())) {
    throw new Error('Enter a valid consent date that is not in the future.');
  }
  if (entry.published && (!entry.consent_confirmed || !entry.consent_date || !entry.consent_source.trim())) {
    throw new Error('Record permission, its date and source before publishing.');
  }
}
export async function prepareTestimonialPhoto(file: File): Promise<string> {
  if (!file.size || file.size > 6 * 1024 * 1024) throw new Error('Choose a photo up to 6 MB.');
  const prepared = await createResizedWebp(await convertImageForUpload(file, { watermark: false }), 960);
  if (prepared.size > 300 * 1024) throw new Error('Prepared photo exceeds 300 KB. Crop or reduce the image first.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result.startsWith('data:image/webp;base64,')
      ? resolve(reader.result.slice('data:image/webp;base64,'.length)) : reject(new Error('Unable to read prepared photo.'));
    reader.onerror = () => reject(new Error('Unable to read prepared photo.'));
    reader.readAsDataURL(prepared);
  });
}
export async function generateTestimonialPhotoDescription(imageBase64: string): Promise<string> {
  const { data, error } = await (await client()).functions.invoke('analyze-product', {
    body: { mode: 'testimonial-photo-description', imageBase64, mimeType: 'image/webp' },
  });
  if (error) {
    if (error.context instanceof Response) {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') throw new Error(body.error);
    }
    throw error;
  }
  if (!data || typeof data.image_alt !== 'string' || !data.image_alt.trim() || data.image_alt.length > 200) {
    throw new Error('Gemini returned an invalid photo description.');
  }
  return data.image_alt.trim();
}
