import { useState } from 'react';
import { CATALOGUE_CONNECTION_MESSAGE } from '../utils/catalogueError';

export default function CatalogueNotice({ message, onRetry }: {
  message: string;
  onRetry?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const connectionIssue = message === CATALOGUE_CONNECTION_MESSAGE;
  return <div role="alert" className={connectionIssue
    ? 'rounded-2xl border border-mustard/50 bg-cream px-4 py-4 text-sm text-cocoa'
    : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'}>
    {connectionIssue && <p className="font-heading text-lg font-bold">Let&apos;s get you connected</p>}
    <p className={connectionIssue ? 'mt-1' : ''}>{message}</p>
    {!connectionIssue && <p className="mt-1 text-xs">Retrying automatically when connected.</p>}
    {connectionIssue && <p className="mt-1 text-xs text-cocoa/70">Any products already loaded remain visible. We&apos;ll refresh the catalogue when you&apos;re back online.</p>}
    {onRetry && <button type="button" disabled={retrying}
      onClick={async () => {
        setRetrying(true);
        try { await onRetry(); } finally { setRetrying(false); }
      }}
      className="mt-3 min-h-11 rounded-full bg-cocoa px-5 py-2 font-semibold text-cream disabled:opacity-60">
      {retrying ? 'Checking connection...' : 'Try again'}
    </button>}
  </div>;
}
