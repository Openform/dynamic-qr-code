import { describe, it, expect } from 'vitest';
import { parseUserAgent, isBotUserAgent, parseLanguage } from '../userAgent';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_5; en_ZA; en; scale=3.00; 1170x2532; 604311327)',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/600000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/80]',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipad:
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36',
  androidGoogleApp:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36 GSA/15.24.36.29.arm64',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  huawei:
    'Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/14.0.6.302 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('parseUserAgent', () => {
  it.each([
    ['iphoneSafari', 'mobile', 'iOS', 'Safari'],
    ['iphoneChrome', 'mobile', 'iOS', 'Chrome'],
    ['iphoneInstagram', 'mobile', 'iOS', 'Instagram'],
    ['iphoneFacebook', 'mobile', 'iOS', 'Facebook'],
    ['iphoneWebView', 'mobile', 'iOS', 'In-app browser'],
    ['ipad', 'tablet', 'iOS', 'Safari'],
    ['androidChrome', 'mobile', 'Android', 'Chrome'],
    ['androidSamsung', 'mobile', 'Android', 'Samsung Internet'],
    ['androidWebView', 'mobile', 'Android', 'In-app browser'],
    ['androidGoogleApp', 'mobile', 'Android', 'Google app'],
    ['androidTablet', 'tablet', 'Android', 'Chrome'],
    ['huawei', 'mobile', 'HarmonyOS', 'Huawei Browser'],
    ['windowsChrome', 'desktop', 'Windows', 'Chrome'],
    ['windowsEdge', 'desktop', 'Windows', 'Edge'],
    ['macSafari', 'desktop', 'macOS', 'Safari'],
    ['macFirefox', 'desktop', 'macOS', 'Firefox'],
    ['linuxFirefox', 'desktop', 'Linux', 'Firefox'],
    ['chromebook', 'desktop', 'ChromeOS', 'Chrome'],
  ])('%s → %s / %s / %s', (key, deviceType, os, browser) => {
    expect(parseUserAgent(UA[key])).toEqual({ deviceType, os, browser });
  });

  it('returns nulls without a user agent', () => {
    expect(parseUserAgent('')).toEqual({ deviceType: null, os: null, browser: null });
    expect(parseUserAgent(undefined)).toEqual({ deviceType: null, os: null, browser: null });
  });

  it('falls back to Other for unknown agents', () => {
    expect(parseUserAgent('SomethingNew/1.0')).toEqual({
      deviceType: 'desktop',
      os: 'Other',
      browser: 'Other',
    });
  });
});

describe('isBotUserAgent', () => {
  it('flags link-preview bots, crawlers and scripts', () => {
    expect(isBotUserAgent('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isBotUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true);
    expect(isBotUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true);
    expect(isBotUserAgent('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBotUserAgent('curl/8.7.1')).toBe(true);
    expect(isBotUserAgent('python-requests/2.31')).toBe(true);
  });

  it('treats a missing user agent as a bot', () => {
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
  });

  it('does not flag real browsers or in-app browsers', () => {
    for (const ua of Object.values(UA)) {
      expect(isBotUserAgent(ua)).toBe(false);
    }
  });
});

describe('parseLanguage', () => {
  it('takes the primary subtag of the first preference', () => {
    expect(parseLanguage('en-ZA,en;q=0.9,af;q=0.8')).toBe('en');
    expect(parseLanguage('af')).toBe('af');
    expect(parseLanguage('ZU-za')).toBe('zu');
    expect(parseLanguage('nso;q=1')).toBe('nso');
  });

  it('returns null for missing or malformed headers', () => {
    expect(parseLanguage(undefined)).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage('*')).toBeNull();
    expect(parseLanguage('english')).toBeNull();
  });
});
