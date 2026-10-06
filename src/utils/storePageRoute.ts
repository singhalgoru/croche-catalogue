export const isStorePage = () => /^\/(?:collections(?:\/|$)|about\/?$|faq\/?$)/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).has('collectionPage');
