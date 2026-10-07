import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}

export default function AdminDialog({ title, children, onClose, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-2xl border border-mustard/40 bg-cream p-0 text-cocoa shadow-xl backdrop:bg-black/50">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-mustard/40 bg-cream p-4">
        <h2 id={titleId} className="font-heading text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label={`Close ${title}`}
          className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm font-semibold disabled:opacity-60">
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
