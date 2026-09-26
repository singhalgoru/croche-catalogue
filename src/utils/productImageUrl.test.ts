import { describe, expect, it } from 'vitest';
import { getProductCardSrcSet, getProductImageUrl } from './productImageUrl';

const source = 'https://catalogue.supabase.co/storage/v1/object/public/product-images/admin/photo.png';

describe('product image delivery', () => {
  it('requests small public image transformations while preserving the original URL', () => {
    expect(getProductImageUrl(source, 96)).toBe(
      'https://catalogue.supabase.co/storage/v1/render/image/public/product-images/admin/photo.png?width=96&quality=75&resize=contain',
    );
    expect(getProductCardSrcSet(source)).toContain('width=480&quality=75&resize=contain 480w');
    expect(getProductCardSrcSet(source)).toContain('width=960&quality=75&resize=contain 960w');
    expect(source).toContain('/object/public/');
  });

  it('leaves static and unrelated images unchanged', () => {
    for (const image of ['/images/product.jpg', 'https://example.com/photo.png',
      'https://catalogue.supabase.co/storage/v1/object/public/other/photo.png']) {
      expect(getProductImageUrl(image, 96)).toBe(image);
      expect(getProductCardSrcSet(image)).toBeUndefined();
    }
  });
});
