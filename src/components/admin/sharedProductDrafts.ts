import { loadSupabase } from '../../lib/supabaseConfig';
import {
  deleteSavedProductDraft as deleteLocalDraft,
  listSavedProductDrafts as listLocalDrafts,
  toStoredProductDraft,
  type ProductDraft,
  type SavedProductDraft,
} from './productDraftStore';
import type { VariantDraft } from './variantDraft';

// Explicitly saved drafts live in Supabase so every catalogue admin can open
// them from any device. Photos go to the private `product-drafts` bucket.

const BUCKET = 'product-drafts';

interface FileRef {
  path: string;
  name: string;
  type: string;
  lastModified: number;
}

type RemoteVariant = Omit<VariantDraft, 'previewUrl' | 'galleryPreviewUrls' | 'imageFile' | 'galleryFiles'> & {
  imageRef: FileRef | null;
  galleryRefs: FileRef[];
};

interface Payload {
  draft: Partial<ProductDraft>;
  variants: RemoteVariant[];
}

export interface SharedProductDraft {
  id: string;
  version: number;
  savedAt: number;
  draft: Partial<ProductDraft>;
  variants: RemoteVariant[];
}

interface Row {
  id: string;
  version: number;
  payload: Payload;
  updated_at: string;
}

const knownDrafts = new Map<string, SharedProductDraft>();
const fileRefs = new WeakMap<File, FileRef>();

const client = async () => {
  const db = await loadSupabase();
  if (!db) throw new Error('Supabase is not configured.');
  return db;
};

const fail = (action: string, error: { message?: string } | null): never => {
  throw new Error(`${action}: ${error?.message || 'Request failed.'}`);
};

const toShared = (row: Row): SharedProductDraft => {
  const shared = {
    id: row.id,
    version: row.version,
    savedAt: new Date(row.updated_at).getTime(),
    draft: row.payload.draft ?? {},
    variants: Array.isArray(row.payload.variants) ? row.payload.variants : [],
  };
  knownDrafts.set(shared.id, shared);
  return shared;
};

const refsOf = (variants: RemoteVariant[]): FileRef[] =>
  variants.flatMap((variant) => [...(variant.imageRef ? [variant.imageRef] : []), ...variant.galleryRefs]);

const removeFiles = async (paths: string[]) => {
  if (paths.length === 0) return;
  try {
    await (await client()).storage.from(BUCKET).remove(paths);
  } catch {
    // Orphaned files stay private; the draft itself is already consistent.
  }
};

export const listSharedProductDrafts = async (): Promise<SharedProductDraft[]> => {
  const db = await client();
  const { data, error } = await db
    .from('product_drafts')
    .select('id, version, payload, updated_at')
    .order('updated_at', { ascending: false });
  if (error) fail('Unable to load saved drafts', error);
  return ((data ?? []) as Row[]).map(toShared);
};

export const saveSharedProductDraft = async (
  draft: ProductDraft,
  variants: VariantDraft[],
  existingId?: string,
  newId?: string,
): Promise<SharedProductDraft> => {
  const db = await client();
  let previous = existingId ? knownDrafts.get(existingId) : undefined;
  if (existingId && !previous) {
    const { data } = await db
      .from('product_drafts')
      .select('id, version, payload, updated_at')
      .eq('id', existingId);
    const found = ((data ?? []) as Row[])[0];
    if (found) previous = toShared(found);
  }
  const id = existingId ?? newId ?? crypto.randomUUID();
  const uploaded: string[] = [];

  const toRef = async (file: File): Promise<FileRef> => {
    const known = fileRefs.get(file);
    if (known) return known;
    const path = `${id}/${crypto.randomUUID()}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) fail(`Unable to upload ${file.name}`, error);
    uploaded.push(path);
    const ref = { path, name: file.name, type: file.type, lastModified: file.lastModified };
    fileRefs.set(file, ref);
    return ref;
  };

  try {
    const stored = toStoredProductDraft(draft, variants);
    const remoteVariants: RemoteVariant[] = [];
    for (const { imageFile, galleryFiles, ...rest } of stored.variants) {
      remoteVariants.push({
        ...rest,
        imageRef: imageFile ? await toRef(imageFile) : null,
        galleryRefs: await Promise.all(galleryFiles.map(toRef)),
      });
    }
    const payload: Payload = { draft, variants: remoteVariants };
    const now = new Date().toISOString();
    let row: Row | null = null;

    if (previous) {
      const { data, error } = await db
        .from('product_drafts')
        .update({ payload, version: previous.version + 1, updated_at: now })
        .eq('id', id)
        .eq('version', previous.version)
        .select('id, version, payload, updated_at');
      if (error) fail('Unable to save the draft', error);
      row = ((data ?? []) as Row[])[0] ?? null;
      if (!row) {
        throw new Error('This draft was changed or deleted by another admin. Reopen it from Drafts to see the latest version.');
      }
    } else {
      const { data, error } = await db
        .from('product_drafts')
        .insert({ id, payload, updated_at: now })
        .select('id, version, payload, updated_at')
        .single();
      if (error) fail('Unable to save the draft', error);
      row = data as Row;
    }

    const saved = toShared(row);
    const kept = new Set(refsOf(saved.variants).map((ref) => ref.path));
    await removeFiles(refsOf(previous?.variants ?? []).map((ref) => ref.path).filter((path) => !kept.has(path)));
    return saved;
  } catch (error) {
    await removeFiles(uploaded);
    throw error;
  }
};

const download = async (ref: FileRef): Promise<File> => {
  const db = await client();
  const { data, error } = await db.storage.from(BUCKET).download(ref.path);
  if (error || !data) fail(`Unable to download ${ref.name}`, error);
  const file = new File([data as Blob], ref.name, { type: ref.type || (data as Blob).type, lastModified: ref.lastModified });
  fileRefs.set(file, ref);
  return file;
};

export const hydrateSharedProductDraft = async (shared: SharedProductDraft): Promise<SavedProductDraft> => ({
  id: shared.id,
  draft: shared.draft,
  savedAt: shared.savedAt,
  variants: await Promise.all(shared.variants.map(async ({ imageRef, galleryRefs, ...rest }) => ({
    ...rest,
    imageFile: imageRef ? await download(imageRef) : null,
    galleryFiles: await Promise.all(galleryRefs.map(download)),
  }))),
});

export const deleteSharedProductDraft = async (id: string): Promise<void> => {
  const db = await client();
  const paths = refsOf(knownDrafts.get(id)?.variants ?? []).map((ref) => ref.path);
  const { error } = await db.from('product_drafts').delete().eq('id', id);
  if (error) fail('Unable to delete the draft', error);
  knownDrafts.delete(id);
  await removeFiles(paths);
};

// Drafts saved before sharing existed are uploaded once, then removed locally.
export const migrateLocalSavedDrafts = async (): Promise<void> => {
  let local: SavedProductDraft[];
  try {
    local = await listLocalDrafts();
  } catch {
    return;
  }
  const db = await client();
  for (const saved of local) {
    try {
      const { data } = await db.from('product_drafts').select('id').eq('id', saved.id);
      if (!data || data.length === 0) {
        const { draft, variants } = {
          draft: { ...saved.draft } as ProductDraft,
          variants: saved.variants.map((variant) => ({ ...variant, previewUrl: null, galleryPreviewUrls: [] })),
        };
        await saveSharedProductDraft(draft, variants, undefined, saved.id);
      }
      await deleteLocalDraft(saved.id);
    } catch {
      // Keep the local copy and retry on the next visit.
    }
  }
};
