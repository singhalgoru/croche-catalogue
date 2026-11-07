export const isStorePage = () => /^\/(?:customer-love(?:\/[^/]+)?\/?$|artisans\/?$|search\/?$|collections(?:\/|$)|bestsellers\/?$|featured\/?$|about\/?$|faq\/?$|bulk-orders\/?$|international-quote\/?$|terms-and-conditions\/?$|privacy-policy\/?$|account-deletion\/?$)/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).has('collectionPage');
