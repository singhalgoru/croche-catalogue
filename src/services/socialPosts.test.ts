import { beforeEach, expect, it, vi } from 'vitest';
import { checkSocialPublishing, prepareProductSocialPosts, publishProductSocialPosts, refreshProductSocialPosts } from './socialPosts';
const mocks = vi.hoisted(() => ({ loadSupabase: vi.fn(), invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: mocks.loadSupabase }));

const productId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadSupabase.mockResolvedValue({ functions: { invoke: mocks.invoke } });
  mocks.invoke.mockResolvedValue({ data: { posts: [] }, error: null });
});

it('sends multipart preparation separately from explicit versioned live publishing and GET-only status refresh', async () => {
  const image = new File(['jpeg'], 'social-post.jpg', { type: 'image/jpeg' });
  const input = { productId, sourceImageUrl: 'https://images.example.test/photo.webp', pageId: '456', captions: { facebook: 'Caption' } };
  await prepareProductSocialPosts(input, image);
  const body: FormData = mocks.invoke.mock.calls[0][1].body;
  expect(JSON.parse(String(body.get('input')))).toEqual({ ...input, action: 'prepare' });
  expect(body.get('image')).toBeInstanceOf(File);
  await publishProductSocialPosts(productId, [{ id, revision: 3 }]);
  expect(mocks.invoke).toHaveBeenLastCalledWith('marketing-post', { body: { action: 'publish', posts: [{ id, revision: 3 }], confirmLive: true } });
  await refreshProductSocialPosts(productId);
  expect(mocks.invoke).toHaveBeenLastCalledWith('marketing-post', { body: { action: 'refresh', productId } });
});

it('parses only safe setup fields and requires a verified Instagram identity when selected', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { setup: {
    enabled: false, pageId: '456', pageName: 'Page', access_token: 'unexpected-fixture', instagram: { id: '999', username: 'luvia' },
  } }, error: null });
  const setup = await checkSocialPublishing(['instagram']);
  expect(JSON.stringify(setup)).not.toContain('unexpected-fixture');
  mocks.invoke.mockResolvedValueOnce({ data: { setup: { enabled: true, pageId: '456', pageName: 'Page' } }, error: null });
  await expect(checkSocialPublishing(['instagram'])).rejects.toThrow('Instagram publishing setup');
});

it('uploads ordered carousel JPEGs and rejects mismatched or oversized selections before invoking', async () => {
  const sources = ['https://images.example.test/front.webp', 'https://images.example.test/back.webp'];
  const images = [new File(['first'], 'first.jpg'), new File(['second'], 'second.jpg')];
  const input = { productId, sourceImageUrl: sources[0], sourceImageUrls: sources, pageId: '456', captions: { facebook: 'Caption' } };
  await prepareProductSocialPosts(input, images);
  const body: FormData = mocks.invoke.mock.calls[0][1].body;
  expect(JSON.parse(String(body.get('input'))).sourceImageUrls).toEqual(sources);
  expect(body.getAll('image').map(file => ({ name: (file as File).name, size: (file as File).size }))).toEqual([
    { name: 'social-post-1.jpg', size: 5 }, { name: 'social-post-2.jpg', size: 6 },
  ]);
  mocks.invoke.mockClear();
  await expect(prepareProductSocialPosts(input, [images[0]])).rejects.toThrow('matching JPEG');
  await expect(prepareProductSocialPosts(input, [
    new File([new Uint8Array(8 * 1024 * 1024)], 'large.jpg'), images[1],
  ])).rejects.toThrow('8 MB in total');
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it('surfaces permission diagnostics and rejects malformed saved-post responses', async () => {
  mocks.invoke.mockResolvedValueOnce({
    data: null, error: { message: 'Function error', context: new Response('{"error":"Reconnect Meta with pages_manage_posts granted."}') },
  });
  await expect(refreshProductSocialPosts(productId)).rejects.toThrow('pages_manage_posts');
  mocks.invoke.mockResolvedValueOnce({ data: { posts: [{ id }] }, error: null });
  await expect(refreshProductSocialPosts(productId)).rejects.toThrow('Invalid saved social post');
});
