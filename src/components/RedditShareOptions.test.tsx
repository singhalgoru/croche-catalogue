import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RedditShareOptions from './RedditShareOptions';

const prepare = vi.hoisted(() => vi.fn());
vi.mock('../utils/redditShareImage', () => ({ getRedditShareImage: prepare }));
const props = { image: '/rose.webp', title: 'Red rose', url: 'https://luviacreations.com/p/rose/',
  description: 'Handmade cotton rose.\nIncludes one flower.',
  redditUrl: 'https://www.reddit.com/submit?title=Red%20rose' };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('waits for the photo, shares image plus title and provides separate title/link copying', async () => {
  const file = new File(['photo'], 'rose.webp', { type: 'image/webp' });
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share, canShare: () => true, clipboard: { writeText } });
  prepare.mockResolvedValue(file);
  render(<RedditShareOptions {...props} />);
  expect(screen.queryByRole('button', { name: 'Share photo to apps' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Download product photo' })).toHaveProperty('disabled', true);
  fireEvent.click(await screen.findByRole('button', { name: 'Share photo to apps' }));
  expect(share).toHaveBeenCalledWith({ files: [file], title: props.title, text: `${props.title}\n${props.url}` });
  fireEvent.click(screen.getByRole('button', { name: 'Copy title' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.title));
  fireEvent.click(screen.getByRole('button', { name: 'Copy product link' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.url));
  fireEvent.click(screen.getByRole('button', { name: 'Copy description' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.description));
  expect(screen.getByText('Description copied. Paste it into the Reddit body, caption or a comment.')).toBeTruthy();
});

it('keeps the description selectable and reports clipboard failure', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) } });
  prepare.mockResolvedValue(new File(['photo'], 'rose.jpg', { type: 'image/jpeg' }));
  render(<RedditShareOptions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy description' }));
  expect(await screen.findByText('Clipboard denied')).toBeTruthy();
  expect(screen.getByText(/Handmade cotton rose/).textContent).toBe(props.description);
});

it('does not offer copying an empty description', () => {
  prepare.mockResolvedValue(new File(['photo'], 'rose.jpg', { type: 'image/jpeg' }));
  render(<RedditShareOptions {...props} description=" " />);
  expect(screen.queryByRole('button', { name: 'Copy description' })).toBeNull();
});

it('surfaces failed image preparation and supports retry without silently sharing only a link', async () => {
  prepare.mockRejectedValueOnce(new Error('Unable to prepare photo')).mockResolvedValueOnce(new File(['photo'], 'rose.jpg', { type: 'image/jpeg' }));
  render(<RedditShareOptions {...props} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to prepare');
  expect(screen.getByRole('link', { name: 'Reddit link post (prefilled title)' }).getAttribute('href')).toBe(props.redditUrl);
  fireEvent.click(screen.getByRole('button', { name: 'Retry photo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download product photo' })).toHaveProperty('disabled', false));
});

it('offers a photo download when native file sharing is unavailable', async () => {
  vi.stubGlobal('navigator', {});
  const create = vi.fn().mockReturnValue('blob:rose');
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  prepare.mockResolvedValue(new File(['photo'], 'rose.webp', { type: 'image/webp' }));
  render(<RedditShareOptions {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Download product photo' })).toHaveProperty('disabled', false));
  fireEvent.click(screen.getByRole('button', { name: 'Download product photo' }));
  expect(click).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Share photo to apps' })).toBeNull();
});
