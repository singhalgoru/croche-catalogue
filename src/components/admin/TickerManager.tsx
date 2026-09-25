import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createTickerMessage,
  deleteTickerMessage,
  fetchAdminTickerMessages,
  reorderTickerMessages,
  updateTickerMessage,
} from '../../services/ticker';
import type { TickerMessage } from '../../types/ticker';

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

export default function TickerManager() {
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      setMessages(await fetchAdminTickerMessages());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load ticker messages.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadMessages());
  }, [loadMessages]);

  const addMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId('__new__');
    setError(null);
    setMessage(null);
    try {
      const value = newMessage.trim();
      await createTickerMessage(value);
      setNewMessage('');
      await loadMessages();
      setMessage(`“${value}” was added to the ticker.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to add the message.');
    } finally {
      setBusyId(null);
    }
  };

  const saveMessage = async (event: FormEvent<HTMLFormElement>, item: TickerMessage) => {
    event.preventDefault();
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      const value = editMessage.trim();
      await updateTickerMessage(item.id, { message: value });
      setEditingId(null);
      await loadMessages();
      setMessage(`Ticker message updated to “${value}”.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the message.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleMessage = async (item: TickerMessage) => {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      await updateTickerMessage(item.id, { isActive: !item.isActive });
      await loadMessages();
      setMessage(`“${item.message}” is now ${item.isActive ? 'inactive' : 'active'}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the message.');
    } finally {
      setBusyId(null);
    }
  };

  const moveMessage = async (index: number, direction: -1 | 1) => {
    const next = moveItem(messages, index, index + direction);
    if (next === messages) return;
    setBusyId(messages[index].id);
    setError(null);
    setMessage(null);
    try {
      await reorderTickerMessages(next);
      setMessages(next.map((item, sortOrder) => ({ ...item, sortOrder })));
      setMessage('Ticker message order was updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to reorder messages.');
      await loadMessages();
    } finally {
      setBusyId(null);
    }
  };

  const removeMessage = async (item: TickerMessage) => {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      await deleteTickerMessage(item.id);
      setDeleteId(null);
      await loadMessages();
      setMessage(`“${item.message}” was deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the message.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-mustard/40 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
        aria-controls="ticker-management-content"
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="block font-heading text-2xl font-bold text-cocoa">
            Manage ticker
          </span>
          <span className="mt-1 block text-sm text-cocoa/65">
            {messages.filter((item) => item.isActive).length} active of {messages.length} message
            {messages.length === 1 ? '' : 's'}
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

      <div id="ticker-management-content" hidden={!isExpanded}>
        <p className="mt-4 text-sm text-cocoa/65">
          Active messages rotate automatically on the storefront in the order shown below.
        </p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={addMessage}>
          <label className="min-w-0 flex-1 text-sm font-semibold text-cocoa">
            New ticker message
            <input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. New festive collection available now"
              className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busyId !== null}
            className="self-end rounded-full bg-cocoa px-5 py-2 text-sm font-semibold text-cream disabled:opacity-60"
          >
            {busyId === '__new__' ? 'Adding…' : 'Add message'}
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

        {isLoading ? (
          <p className="py-6 text-center text-sm text-cocoa/60">Loading ticker messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-cocoa/60">No custom ticker messages yet.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {messages.map((item, index) => (
              <div
                key={item.id}
                role="group"
                aria-label={`Ticker message ${index + 1}`}
                className="rounded-xl border border-mustard/30 bg-cream/50 p-3"
              >
                {editingId === item.id ? (
                  <form onSubmit={(event) => void saveMessage(event, item)}>
                    <label className="text-sm font-semibold text-cocoa">
                      Edit ticker message
                      <input
                        value={editMessage}
                        onChange={(event) => setEditMessage(event.target.value)}
                        required
                        minLength={2}
                        maxLength={160}
                        className="mt-1 w-full rounded-xl border border-mustard/60 px-3 py-2"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busyId !== null}
                        className="rounded-full bg-cocoa px-4 py-1.5 text-sm font-semibold text-cream disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={busyId !== null}
                        className="rounded-full border border-cocoa/30 px-4 py-1.5 text-sm font-semibold text-cocoa"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : deleteId === item.id ? (
                  <div>
                    <p className="text-sm font-semibold text-red-800">
                      Delete “{item.message}” permanently?
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void removeMessage(item)}
                        disabled={busyId !== null}
                        className="rounded-full bg-red-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(null)}
                        disabled={busyId !== null}
                        className="rounded-full border border-cocoa/30 px-4 py-1.5 text-sm font-semibold text-cocoa"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-cocoa">{item.message}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-cocoa/10 text-cocoa/60'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                      <button
                        type="button"
                        onClick={() => void moveMessage(index, -1)}
                        disabled={busyId !== null || index === 0}
                        className="text-cocoa underline disabled:opacity-35"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveMessage(index, 1)}
                        disabled={busyId !== null || index === messages.length - 1}
                        className="text-cocoa underline disabled:opacity-35"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleMessage(item)}
                        disabled={busyId !== null}
                        className="text-cocoa underline disabled:opacity-35"
                      >
                        {item.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditMessage(item.message);
                          setDeleteId(null);
                        }}
                        disabled={busyId !== null}
                        className="text-cocoa underline disabled:opacity-35"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteId(item.id);
                          setEditingId(null);
                        }}
                        disabled={busyId !== null}
                        className="text-red-700 underline disabled:opacity-35"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
