import { useEffect, useRef } from 'react';
import CustomerAccount from './CustomerAccount';

interface Props {
  mode: 'signin' | 'signup';
  accountName?: string | null;
  onClose: () => void;
}
export default function AccountDialog({ mode, accountName, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-cocoa/40 sm:items-center" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-cream p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="account-dialog-title" className="font-heading text-xl font-bold text-cocoa">
            {accountName ? `Hi, ${accountName}` : mode === 'signup' ? 'Create your Luvia account' : 'Sign in to Luvia'}
          </h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close account"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cocoa/20 text-2xl text-cocoa">×</button>
        </div>
        <CustomerAccount key={mode} canSignUp initialMode={mode} />
      </div>
    </div>
  );
}
