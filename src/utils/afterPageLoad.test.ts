import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterPageLoad } from './afterPageLoad';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('afterPageLoad', () => {
  it('waits for the load event when the document is still loading', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    const callback = vi.fn();

    afterPageLoad(callback);
    expect(callback).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(callback).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('load'));
    expect(callback).toHaveBeenCalledOnce();
  });

  it('runs immediately if the load event has already fired', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    const callback = vi.fn();

    afterPageLoad(callback);
    expect(callback).toHaveBeenCalledOnce();
  });
});
