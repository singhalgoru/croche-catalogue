import { useInstallPrompt } from '../hooks/useInstallPrompt';

/** Small call-to-action so customers can install the shop as an app without
 * having to find the option in their browser's menu. */
export default function InstallAppButton() {
  const { canInstall, promptInstall } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-cocoa bg-white px-4 py-1.5 text-sm font-semibold text-cocoa shadow-sm hover:bg-mustard/10"
    >
      <span aria-hidden="true">📲</span>
      Install App
    </button>
  );
}
