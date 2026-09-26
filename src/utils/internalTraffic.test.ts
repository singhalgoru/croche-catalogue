import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureInternalTrafficPreference, isInternalTraffic } from './internalTraffic';

const setLocation = (search: string) => {
  window.history.replaceState(null, '', `/${search}`);
};

describe('internal traffic', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocation('');
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('treats ordinary visits as customer traffic', () => {
    expect(captureInternalTrafficPreference()).toBe(false);
    expect(isInternalTraffic()).toBe(false);
  });

  it('marks the browser after visiting the internal traffic link', () => {
    setLocation('?traffic=internal');
    expect(captureInternalTrafficPreference()).toBe(true);

    setLocation('');
    expect(captureInternalTrafficPreference()).toBe(true);
    expect(isInternalTraffic()).toBe(true);
  });

  it('clears the marker when the external traffic link is used', () => {
    setLocation('?traffic=internal');
    captureInternalTrafficPreference();

    setLocation('?traffic=external');
    expect(captureInternalTrafficPreference()).toBe(false);

    setLocation('');
    expect(isInternalTraffic()).toBe(false);
  });
});
