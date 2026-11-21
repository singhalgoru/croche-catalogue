import contentArticles from '../content/contentArticles.json';

export const isStorePage = () => /^\/(?:customer-love(?:\/[^/]+)?\/?$|artisans\/?$|search\/?$|collections(?:\/|$)|bestsellers\/?$|featured\/?$|crochet-gift-guide\/?$|about\/?$|faq\/?$|bulk-orders\/?$|international-quote\/?$|terms-and-conditions\/?$|privacy-policy\/?$|account-deletion\/?$|return-policy\/?$)/.test(window.location.pathname)
  || contentArticles.some(article => article.path.replace(/\/?$/, '/') === window.location.pathname.replace(/\/?$/, '/'))
  || new URLSearchParams(window.location.search).has('collectionPage');
