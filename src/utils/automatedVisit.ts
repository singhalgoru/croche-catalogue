// Crawlers, speed tests and headless browsers run the site's JavaScript, so
// GA4 counts them as "active users" — typically from data-centre towns such
// as Council Bluffs — even though they never look at a product. GA4's
// built-in bot filtering misses many of them, so skip analytics entirely.
// Crawlers identify as "Somebot/1.0" or include a "+http://" contact link.
// A bare "bot" match would also catch real phones such as Cubot handsets.
const AUTOMATED_USER_AGENT =
  /bot\/|bot;|bot\)|\+https?:\/\/|crawl|spider|slurp|lighthouse|pagespeed|headless|phantomjs|puppeteer|playwright|selenium|webdriver|cypress|google-inspectiontool|googleother|google-pagerenderer|google-read-aloud|mediapartners-google|apis-google|feedfetcher|facebookexternalhit|bytespider|gtmetrix|ptst\/|prerender|screaming frog|python-requests|python-urllib|go-http-client|okhttp|curl\/|wget\//i;

interface NavigatorLike {
  userAgent?: string;
  webdriver?: boolean;
  userAgentData?: { brands?: { brand: string }[] };
}

export const isAutomatedVisit = (
  nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): boolean => {
  if (!nav) return false;
  // Set by WebDriver, Puppeteer, Playwright and most headless tooling.
  if (nav.webdriver === true) return true;
  if (AUTOMATED_USER_AGENT.test(nav.userAgent ?? '')) return true;
  return (
    nav.userAgentData?.brands?.some(({ brand }) => /headless/i.test(brand)) ?? false
  );
};
