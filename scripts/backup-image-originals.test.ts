// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupOriginals } from './backup-image-originals.mjs';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true });
  }
});
const destination = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'luvia-original-backup-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

describe('backupOriginals', () => {
  it('recurses through originals and skips saved files without deleting old backups', async () => {
    const root = await destination();
    await writeFile(path.join(root, 'older.png'), 'old');
    const list = vi.fn(async (prefix: string) => ({
      data: prefix === '' ? [{ name: 'admin', id: null }]
        : prefix === 'admin' ? [{ name: 'image-id', id: null }]
          : [{ name: 'original.png', id: 'object-id', metadata: { size: 5 } }],
      error: null,
    }));
    const download = vi.fn(async () => ({ data: new Blob(['photo']), error: null }));
    const client = { storage: { from: vi.fn(() => ({ list, download })) } };
    expect(await backupOriginals(client, root)).toEqual({ total: 1, downloaded: 1 });
    expect(client.storage.from).toHaveBeenCalledWith('product-originals');
    expect(download).toHaveBeenCalledWith('admin/image-id/original.png');
    expect(await readFile(path.join(root, 'admin', 'image-id', 'original.png'), 'utf8')).toBe('photo');
    expect(await backupOriginals(client, root)).toEqual({ total: 1, downloaded: 0 });
    expect(download).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(root, 'older.png'), 'utf8')).toBe('old');
  });

  it('paginates lists and surfaces listing errors', async () => {
    const root = await destination();
    const list = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({
        name: `original-${i}.png`, id: `id-${i}`, metadata: { size: 1 },
      })), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const download = vi.fn(async () => ({ data: new Blob(['x']), error: null }));
    expect(await backupOriginals({ storage: { from: () => ({ list, download }) } }, root))
      .toEqual({ total: 100, downloaded: 100 });
    expect(list.mock.calls[1]).toEqual(['', {
      limit: 100, offset: 100, sortBy: { column: 'name', order: 'asc' },
    }]);
    list.mockResolvedValue({ data: null, error: { message: 'Denied' } });
    await expect(backupOriginals({ storage: { from: () => ({ list, download }) } }, root))
      .rejects.toThrow('Denied');
  });

  it('rejects failed downloads and unsafe paths', async () => {
    const root = await destination();
    const list = vi.fn(async () => ({
      data: [{ name: 'original.png', id: 'id', metadata: { size: 1 } }], error: null,
    }));
    const download = vi.fn(async () => ({ data: null, error: { message: 'Unavailable' } }));
    const client = { storage: { from: () => ({ list, download }) } };
    await expect(backupOriginals(client, root)).rejects.toThrow('Unavailable');
    list.mockResolvedValue({ data: [{ name: '../private', id: 'id', metadata: { size: 1 } }], error: null });
    await expect(backupOriginals(client, root)).rejects.toThrow('Unsafe path');
  });
});
