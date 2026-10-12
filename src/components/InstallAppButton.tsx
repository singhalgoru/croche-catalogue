import { useInstallPrompt } from '../hooks/useInstallPrompt';

/** Small call-to-action so customers can install the shop as an app without
 * having to find the option in their browser's menu. */
export default function InstallAppButton() {
  const { canInstall, promptInstall, showSuggestion, dismissSuggestion } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <>
    {showSuggestion && <section aria-label="Install Luvia app"
      className="mx-4 w-full max-w-sm rounded-2xl border border-mustard/50 bg-white p-4 text-left text-cocoa shadow-lg">
      <p className="font-heading text-lg font-semibold">Keep Luvia close</p>
      <p className="mt-1 text-sm">Add Luvia to your home screen for quick access to handmade favourites.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => void promptInstall()}
          className="min-h-11 rounded-full bg-cocoa px-5 py-2 text-sm font-semibold text-cream">Install app</button>
        <button type="button" onClick={dismissSuggestion}
          className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold underline underline-offset-4">Not now</button>
      </div>
    </section>}
    {!showSuggestion && <button
      type="button"
      onClick={() => void promptInstall()}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-cocoa bg-white px-4 py-1.5 text-sm font-semibold text-cocoa shadow-sm hover:bg-mustard/10"
    >
      <span aria-hidden="true">📲</span>
      Install App
    </button>}
    </>
  );
}
