let holds = 0;
let reloadPending = false;

/**
 * Reloads the page so a newly activated service worker's bundle takes over,
 * unless something has asked to hold reloads (such as the browser's install
 * dialog, which a reload would silently close).
 */
export const requestPageReload = () => {
  if (holds > 0) {
    reloadPending = true;
    return;
  }
  window.location.reload();
};

/** Returns a release function; a held reload runs once every hold is released. */
export const holdPageReload = () => {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0 && reloadPending) {
      reloadPending = false;
      window.location.reload();
    }
  };
};
