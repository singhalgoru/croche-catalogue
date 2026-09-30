import { describe, expect, it } from 'vitest';
import { isAutomatedVisit } from './automatedVisit';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; CPH2581) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const INSTAGRAM_IN_APP =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android';
const DESKTOP_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';

describe('isAutomatedVisit', () => {
  it.each([
    ['Chrome on Android', CHROME_ANDROID],
    ['Safari on iPhone', SAFARI_IPHONE],
    ['Instagram in-app browser', INSTAGRAM_IN_APP],
    ['Edge on Windows', DESKTOP_EDGE],
    ['a Cubot Android phone', 'Mozilla/5.0 (Linux; Android 12; Cubot X30 Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'],
  ])('counts real shoppers (%s)', (_label, userAgent) => {
    expect(isAutomatedVisit({ userAgent, webdriver: false })).toBe(false);
  });

  it.each([
    ['Googlebot', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['PageSpeed Insights / Lighthouse', 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse'],
    ['Search Console inspection', 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)'],
    ['headless Chrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36'],
    ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['Ahrefs', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
    ['GTmetrix', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 GTmetrix'],
  ])('skips %s', (_label, userAgent) => {
    expect(isAutomatedVisit({ userAgent })).toBe(true);
  });

  it('skips browsers driven by automation tools even with a normal user agent', () => {
    expect(isAutomatedVisit({ userAgent: DESKTOP_EDGE, webdriver: true })).toBe(true);
  });

  it('skips headless browsers that only reveal themselves in client hints', () => {
    expect(
      isAutomatedVisit({
        userAgent: DESKTOP_EDGE,
        userAgentData: { brands: [{ brand: 'HeadlessChrome' }, { brand: 'Chromium' }] },
      }),
    ).toBe(true);
  });

  it('does not treat a missing navigator as a bot', () => {
    expect(isAutomatedVisit(undefined)).toBe(false);
  });
});
