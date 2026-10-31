export const isStorePage = () => /^\/(?:artisans\/?$|search\/?$|collections(?:\/|$)|bestsellers\/?$|featured\/?$|about\/?$|faq\/?$|bulk-orders\/?$|international-quote\/?$|terms-and-conditions\/?$|privacy-policy\/?$)/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).has('collectionPage');
