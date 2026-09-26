export const afterPageLoad = (callback: () => void) => {
  if (document.readyState === 'complete') {
    callback();
  } else {
    window.addEventListener('load', callback, { once: true });
  }
};
