const STORAGE_KEY = 'luvia:internal-traffic';

// GA4's built-in "Internal Traffic" data filter matches on this exact value.
export const INTERNAL_TRAFFIC_TYPE = 'internal';

const readFlag = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeFlag = (enabled: boolean) => {
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, 'true');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
};

// Home broadband IPs are dynamic, so GA4's IP-based internal traffic rule is
// unreliable. Visiting ?traffic=internal marks this browser instead, and
// ?traffic=external clears it again.
export const captureInternalTrafficPreference = (): boolean => {
  const traffic = new URLSearchParams(window.location.search).get('traffic');
  if (traffic === INTERNAL_TRAFFIC_TYPE) writeFlag(true);
  else if (traffic === 'external') writeFlag(false);
  return readFlag();
};

export const isInternalTraffic = (): boolean => readFlag();
