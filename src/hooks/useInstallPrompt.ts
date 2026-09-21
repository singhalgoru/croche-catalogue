import { useEffect, useState } from 'react';
import { trackEvent } from '../services/analytics';

// Chrome/Android's own type for the event isn't in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari's PWA flag; harmless no-op on other browsers.
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Surfaces the browser's "Add to Home Screen" prompt so the catalogue can
 * offer its own install button instead of relying on customers to find the
 * option in the browser menu.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      trackEvent('pwa_installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    trackEvent('pwa_install_prompt_shown');
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    trackEvent('pwa_install_prompt_result', { outcome });
    setDeferredPrompt(null);
  };

  return { canInstall: Boolean(deferredPrompt) && !isInstalled, promptInstall };
}
