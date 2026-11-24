import { afterPageLoad } from '../utils/afterPageLoad';
import { isAutomatedVisit } from '../utils/automatedVisit';
import { isInternalTraffic } from '../utils/internalTraffic';
import { hasAnalyticsAuthTokens } from './analyticsPage';

interface PinterestTag {
  (...args: unknown[]): void;
  queue: unknown[][];
  version: string;
}

declare global {
  interface Window { pintrk?: PinterestTag }
}

const canTrack = () => !window.location.search && !window.location.hash
  && !/^\/artisans(?:\/|$)/.test(window.location.pathname)
  && !isInternalTraffic() && !isAutomatedVisit() && !hasAnalyticsAuthTokens();

export function trackPinterestPage() {
  const id = import.meta.env.VITE_PINTEREST_TAG_ID?.trim();
  if (!id || !canTrack()) return;
  if (!/^[0-9]{5,30}$/.test(id)) {
    console.error('Invalid Pinterest tag ID; Pinterest tracking is disabled.');
    return;
  }
  if (!window.pintrk) {
    const tag: PinterestTag = Object.assign((...args: unknown[]) => {
      window.pintrk?.queue.push(args);
    }, { queue: [] as unknown[][], version: '3.0' });
    window.pintrk = tag;
    tag('load', id);
    afterPageLoad(() => {
      if (!canTrack()) {
        if (window.pintrk === tag) delete window.pintrk;
        return;
      }
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://s.pinimg.com/ct/core.js';
      document.head.append(script);
    });
  }
  window.pintrk('page');
}
