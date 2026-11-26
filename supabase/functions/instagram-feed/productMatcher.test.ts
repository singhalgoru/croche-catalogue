// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { matchInstagramPosts, type InstagramMatchProduct } from './productMatcher';

const now = Date.now();
const post = {
  id: '100',
  permalink: 'https://www.instagram.com/p/match/',
  previewUrl: 'https://scontent.cdninstagram.com/post.jpg',
  caption: 'Crochet bunnies, ready for their new home',
  mediaType: 'IMAGE' as const,
  timestamp: new Date(now).toISOString(),
};
const products: InstagramMatchProduct[] = [
  {
    id: 'bunny-toy-id', name: 'Bunny Toy', public_slug: 'bunny-toy', description: 'A handmade crochet bunny toy',
    published: true,
    product_variants: [{
      name: 'Default', color: '#ffffff', image_url: 'https://images.luviacreations.com/products/bunny-toy.webp',
      in_stock: true, available_quantity: 1, sort_order: 0,
    }],
  },
  {
    id: 'cute-bunny-id', name: 'Cute Bunny', public_slug: 'cute-bunny', description: 'A crochet bunny in pink overalls',
    published: true,
    product_variants: [{
      name: 'Default', color: '#f080a0', image_url: 'https://images.luviacreations.com/products/cute-bunny.webp',
      in_stock: true, available_quantity: 1, sort_order: 0,
    }],
  },
];

const imageResponse = () => new Response(new Uint8Array([1, 2, 3]), {
  headers: { 'Content-Type': 'image/webp', 'Content-Length': '3' },
});
const modelResponse = (value: unknown) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
}));
const visualResult = (productId: string, confidence: number, runnerUpConfidence = 0.1) => ({
  productId, confidence, runnerUpConfidence,
});
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => fetcher.mockReset());

it('matches a unique product name in the post caption without calling the visual model', async () => {
  const result = await matchInstagramPosts([{ ...post, caption: 'Meet our Cute Bunny!' }], products, 'gemini-key-fixture', fetcher);
  expect(result[0]).toMatchObject({ productId: 'cute-bunny-id', productMatchStatus: 'matched' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses visual comparison for ambiguous captions and links only a high-confidence catalogue match', async () => {
  fetcher.mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(modelResponse(visualResult('bunny-toy-id', 0.97, 0.12)));
  const result = await matchInstagramPosts([post], products, 'gemini-key-fixture', fetcher);
  expect(result[0]).toMatchObject({ productId: 'bunny-toy-id', productMatchStatus: 'matched' });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('leaves uncertain and invalid visual matches unlinked', async () => {
  fetcher.mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(imageResponse())
    .mockResolvedValueOnce(modelResponse(visualResult('cute-bunny-id', 0.82, 0.1)))
    .mockResolvedValueOnce(modelResponse(visualResult('unknown-product', 0.99, 0.01)));
  const result = await matchInstagramPosts([post], products, 'gemini-key-fixture', fetcher);
  expect(result[0]).toMatchObject({ productId: null, productMatchStatus: 'unmatched' });
});

it('preserves curated post mappings only when their product is published and in stock', async () => {
  const bunnyPost = { ...post, id: '18444362995183919', caption: 'A lovely handmade bunny' };
  const product = { ...products[1], id: '88d58adb-3573-4c6c-ba3c-791a151c0726' };
  const matched = await matchInstagramPosts([bunnyPost], [product], undefined, fetcher);
  expect(matched[0]).toMatchObject({ productId: product.id, productMatchStatus: 'matched' });

  const unavailable = {
    ...product,
    product_variants: product.product_variants?.map(variant => ({ ...variant, in_stock: false, available_quantity: 0 })),
  };
  const unmatched = await matchInstagramPosts([bunnyPost], [unavailable], undefined, fetcher);
  expect(unmatched[0]).toMatchObject({ productId: null, productMatchStatus: 'unmatched' });
});
