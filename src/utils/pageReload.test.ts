import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdPageReload, requestPageReload } from './pageReload';

describe('pageReload', () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('reloads immediately when nothing holds it', () => {
    requestPageReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('defers a reload until every hold is released', () => {
    const releaseFirst = holdPageReload();
    const releaseSecond = holdPageReload();
    requestPageReload();
    expect(reload).not.toHaveBeenCalled();

    releaseFirst();
    releaseFirst();
    expect(reload).not.toHaveBeenCalled();

    releaseSecond();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on release when no reload was requested', () => {
    holdPageReload()();
    expect(reload).not.toHaveBeenCalled();
  });
});
