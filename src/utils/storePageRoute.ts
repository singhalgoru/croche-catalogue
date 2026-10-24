export const isStorePage = () => /^\/(?:collections(?:\/|$)|bestsellers\/?$|featured\/?$|about\/?$|faq\/?$|bulk-orders\/?$|terms-and-conditions\/?$|privacy-policy\/?$)/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).has('collectionPage');
