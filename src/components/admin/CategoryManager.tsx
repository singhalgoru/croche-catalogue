import { useState, type FormEvent } from 'react';
import {
  createCategory,
  deleteCategory,
  renameCategory,
  updateCategoryPresentation,
} from '../../services/categories';
import type { CategorySettings } from '../../types/product';

interface Props {
  categories: CategorySettings[];
  onChanged: () => Promise<void>;
}

export default function CategoryManager({ categories, onChanged }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [replacementName, setReplacementName] = useState('');
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const addCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyName('__new__');
    setError(null);
    setMessage(null);
    try {
      const name = newName.trim();
      await createCategory(name);
      setNewName('');
      setMessage(`“${name}” was added.`);
      await onChanged();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Unable to create the category.',
      );
    } finally {
      setBusyName(null);
    }
  };

  const saveRename = async (event: FormEvent<HTMLFormElement>, currentName: string) => {
    event.preventDefault();
    setBusyName(currentName);
    setError(null);
    setMessage(null);
    try {
      const name = replacementName.trim();
      await renameCategory(currentName, name);
      setEditingName(null);
      setReplacementName('');
      setMessage(`“${currentName}” was renamed to “${name}”.`);
      await onChanged();
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : 'Unable to rename the category.',
      );
    } finally {
      setBusyName(null);
    }
  };

  const removeCategory = async (name: string) => {
    setBusyName(name);
    setError(null);
    setMessage(null);
    try {
      await deleteCategory(name);
      setDeleteName(null);
      setMessage(`“${name}” was deleted.`);
      await onChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Unable to delete the category.',
      );
    } finally {
      setBusyName(null);
    }
  };

  const savePresentation = async (category: CategorySettings) => {
    const priority = Number(priorities[category.name]);
    if (!Number.isInteger(priority) || priority < 1 || priority > 999) {
      setError('Category priority must be a whole number between 1 and 999.');
      return;
    }

    setBusyName(category.name);
    setError(null);
    setMessage(null);
    try {
      await updateCategoryPresentation(category.name, priority);
      setMessage(`“${category.name}” priority was updated to ${priority}.`);
      await onChanged();
      setPriorities((current) => {
        const next = { ...current };
        delete next[category.name];
        return next;
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Unable to update category display settings.',
      );
    } finally {
      setBusyName(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls="category-management-content"
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block font-heading text-2xl font-bold text-cocoa">
            Manage categories
          </span>
          <span className="mt-1 block text-sm text-cocoa/65">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} available
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard/20 text-xl text-cocoa transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        >
          ⌄
        </span>
      </button>

      <div id="category-management-content" hidden={!isExpanded}>
        <p className="mt-4 text-sm text-cocoa/65">
          Use lower priority numbers to show categories earlier in the catalogue.
        </p>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={addCategory}>
        <label className="flex-1 text-sm font-semibold text-cocoa">
          New category
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            minLength={2}
            maxLength={50}
            placeholder="e.g. Bags"
            className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busyName !== null}
          className="self-end rounded-full bg-cocoa px-5 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {busyName === '__new__' ? 'Adding…' : 'Add category'}
        </button>
        </form>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {message}
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
          <div key={category.name} className="rounded-xl border border-mustard/30 bg-cream/50 p-3">
            {editingName === category.name ? (
              <form onSubmit={(event) => void saveRename(event, category.name)}>
                <label className="text-sm font-semibold text-cocoa">
                  Rename category
                  <input
                    value={replacementName}
                    onChange={(event) => setReplacementName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={50}
                    className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={busyName !== null}
                    className="rounded-full bg-cocoa px-4 py-1.5 text-sm font-semibold text-cream disabled:opacity-60"
                  >
                    {busyName === category.name ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(null)}
                    disabled={busyName !== null}
                    className="rounded-full border border-cocoa/30 px-4 py-1.5 text-sm font-semibold text-cocoa"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : deleteName === category.name ? (
              <div>
                <p className="text-sm font-semibold text-red-800">
                  Delete “{category.name}”? This works only when no products use it.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void removeCategory(category.name)}
                    disabled={busyName !== null}
                    className="rounded-full bg-red-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busyName === category.name ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteName(null)}
                    disabled={busyName !== null}
                    className="rounded-full border border-cocoa/30 px-4 py-1.5 text-sm font-semibold text-cocoa"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-cocoa">{category.name}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_auto] sm:items-end sm:justify-end">
                  <label className="text-sm font-semibold text-cocoa">
                    Priority
                    <input
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={priorities[category.name] ?? String(category.priority)}
                      onChange={(event) =>
                        setPriorities((current) => ({
                          ...current,
                          [category.name]: event.target.value,
                        }))
                      }
                      aria-label={`Priority for ${category.name}`}
                      disabled={busyName !== null}
                      className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void savePresentation(category)}
                    disabled={busyName !== null}
                    className="rounded-full bg-mustard px-4 py-2 text-sm font-semibold text-cocoa disabled:opacity-60"
                  >
                    {busyName === category.name ? 'Saving…' : 'Save display'}
                  </button>
                </div>
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(category.name);
                      setReplacementName(category.name);
                      setDeleteName(null);
                    }}
                    className="text-sm font-semibold text-cocoa underline"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteName(category.name);
                      setEditingName(null);
                    }}
                    disabled={categories.length === 1}
                    title={
                      categories.length === 1
                        ? 'At least one category must remain.'
                        : undefined
                    }
                    className="text-sm font-semibold text-red-700 underline disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
          ))}
        </div>
      </div>
    </section>
  );
}
