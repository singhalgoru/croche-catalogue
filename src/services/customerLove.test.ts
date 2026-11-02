import { beforeEach, expect, it, vi } from 'vitest';
import { customerLoveRepository, fetchTestimonials, newTestimonial, prepareTestimonialPhoto, validateTestimonial } from './customerLove';

const { rpc, convert, resize } = vi.hoisted(() => ({ rpc: vi.fn(), convert: vi.fn(), resize: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ rpc }) }));
vi.mock('../utils/imageUploadConversion', () => ({ convertImageForUpload: convert, createResizedWebp: resize }));
const valid = () => ({ ...newTestimonial(), display_name: 'Demo customer', quote: 'A lovely handmade keepsake.' });
beforeEach(() => vi.clearAllMocks());

it('requires recorded permission before publication, but allows a private draft', () => {
  const draft = valid();
  expect(() => validateTestimonial(draft)).not.toThrow();
  expect(() => validateTestimonial({ ...draft, published: true })).toThrow('permission');
  expect(() => validateTestimonial({ ...draft, published: true, consent_confirmed: true })).toThrow('permission');
  expect(() => validateTestimonial({ ...draft, published: true, consent_confirmed: true,
    consent_date: '2026-01-01', consent_source: 'Written permission' })).not.toThrow();
});
it('validates quote, order, photo descriptions and consent dates', () => {
  const draft = valid();
  expect(() => validateTestimonial({ ...draft, quote: 'Short' })).toThrow('quote');
  expect(() => validateTestimonial({ ...draft, sort_order: 1.5 })).toThrow('whole number');
  expect(() => validateTestimonial({ ...draft, has_image: true })).toThrow('Describe the photo');
  expect(() => validateTestimonial({ ...draft, consent_date: '2999-01-01' })).toThrow('future');
});
it('requests only published public data and rejects malformed responses', async () => {
  rpc.mockResolvedValueOnce({ data: [valid()] });
  expect(await fetchTestimonials()).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith('list_customer_love', { admin_view: false });
  rpc.mockResolvedValueOnce({ data: [{ id: 'partial' }] });
  await expect(fetchTestimonials()).rejects.toThrow('Invalid Customer Love');
});
it('guards admin reads, version-checks saves and requires matching receipts', async () => {
  const entry = valid();
  rpc.mockResolvedValueOnce({ data: [entry] });
  expect(await customerLoveRepository.list()).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith('list_customer_love', { admin_view: true });
  rpc.mockResolvedValueOnce({ data: entry.id });
  await customerLoveRepository.save(entry, '');
  expect(rpc).toHaveBeenLastCalledWith('save_customer_love', {
    testimonial_id: entry.id, expected_version: 0, entry, photo_base64: '',
  });
  rpc.mockResolvedValueOnce({ data: 'wrong-id' });
  await expect(customerLoveRepository.remove(entry)).rejects.toThrow('not confirmed');
  rpc.mockResolvedValueOnce({ error: new Error('Version conflict') });
  await expect(customerLoveRepository.save(entry, null)).rejects.toThrow('Version conflict');
});
it('prepares unwatermarked resized photos and enforces prepared size', async () => {
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  const prepared = new File(['webp'], 'photo.webp', { type: 'image/webp' });
  convert.mockResolvedValue(prepared); resize.mockResolvedValue(prepared);
  expect(await prepareTestimonialPhoto(file)).toBe(btoa('webp'));
  expect(convert).toHaveBeenCalledWith(file, { watermark: false });
  expect(resize).toHaveBeenCalledWith(prepared, 960);
  resize.mockResolvedValue(new File([new Uint8Array(300 * 1024 + 1)], 'big.webp', { type: 'image/webp' }));
  await expect(prepareTestimonialPhoto(file)).rejects.toThrow('300 KB');
  await expect(prepareTestimonialPhoto(new File([], 'empty.jpg'))).rejects.toThrow('6 MB');
});
