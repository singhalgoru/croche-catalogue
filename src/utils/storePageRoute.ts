export const isStorePage = () => /^\/(?:collections(?:\/|$)|about\/?$|faq\/?$|terms-and-conditions\/?$|privacy-policy\/?$)/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).has('collectionPage');
