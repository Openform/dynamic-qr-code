/**
 * Turn a scan's request headers into the coarse buckets shown on the
 * analytics dashboard: device type, OS, browser/app, language, and whether
 * the request came from a bot (link previews, crawlers, scripts).
 *
 * Only broad families are needed, so this is a short list of patterns rather
 * than a full user-agent library. Order matters: in-app browsers and
 * Chromium-based browsers also contain "Chrome" or "Safari", so they're
 * checked first.
 */

import { isbot } from 'isbot';

// [label, pattern] — first match wins.
const OS_PATTERNS = [
  ['iOS', /iPhone|iPad|iPod/],
  ['HarmonyOS', /HarmonyOS|OpenHarmony/],
  ['Android', /Android/],
  ['Windows', /Windows/],
  ['ChromeOS', /CrOS/],
  ['macOS', /Macintosh|Mac OS X/],
  ['KaiOS', /KAIOS/i],
  ['Linux', /Linux|X11/],
];

const BROWSER_PATTERNS = [
  // In-app browsers (links opened inside a social or messaging app)
  ['Instagram', /Instagram/],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/],
  ['TikTok', /musical_ly|BytedanceWebview|TikTok/i],
  ['Snapchat', /Snapchat/],
  ['LinkedIn', /LinkedInApp/],
  ['X (Twitter)', /Twitter/],
  ['WeChat', /MicroMessenger/],
  ['Line', /\bLine\//],
  ['WhatsApp', /WhatsApp/],
  ['Google app', /\bGSA\//],
  // Browsers
  ['Samsung Internet', /SamsungBrowser/],
  ['Edge', /Edg(e|A|iOS)?\//],
  ['Opera', /OPR\/|Opera|OPiOS|OPT\//],
  ['Firefox', /Firefox|FxiOS/],
  ['Huawei Browser', /HuaweiBrowser/],
  ['Xiaomi Browser', /MiuiBrowser/],
  ['UC Browser', /UCBrowser/],
  ['Yandex', /YaBrowser/],
  ['In-app browser', /; wv\)/], // Android WebView inside some other app
  ['Chrome', /CriOS|Chrome\//],
  ['Safari', /Safari\//],
];

const TABLET = /iPad|Tablet|PlayBook|Silk|Kindle|Nexus (7|9|10)/i;
const MOBILE = /Mobi|iPhone|iPod|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile|KAIOS/i;

function firstMatch(patterns, ua) {
  for (const [label, pattern] of patterns) {
    if (pattern.test(ua)) return label;
  }
  return null;
}

function deviceTypeOf(ua) {
  if (TABLET.test(ua)) return 'tablet';
  if (MOBILE.test(ua)) return 'mobile';
  // Android tablets leave "Mobile" out of their user agent.
  if (/Android/.test(ua)) return 'tablet';
  return 'desktop';
}

function browserOf(ua, os) {
  const match = firstMatch(BROWSER_PATTERNS, ua);
  if (match) return match;
  // iOS apps that open links in an embedded WebKit view leave out "Safari/".
  if (os === 'iOS' && /AppleWebKit/.test(ua)) return 'In-app browser';
  return 'Other';
}

/**
 * Device type ('mobile' | 'tablet' | 'desktop'), OS family and browser/app for
 * a user agent. All three are null when there's no user agent.
 *
 * iPads on iPadOS 13+ send a desktop Mac user agent by default, so most of
 * them are counted as macOS desktops; there's no way to tell from the header.
 */
export function parseUserAgent(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent.trim() : '';
  if (!ua) return { deviceType: null, os: null, browser: null };

  const os = firstMatch(OS_PATTERNS, ua) ?? 'Other';
  return { deviceType: deviceTypeOf(ua), os, browser: browserOf(ua, os) };
}

/**
 * True for link-preview bots (WhatsApp, Slack, Facebook…), crawlers and
 * scripts. A missing user agent counts as a bot too: every real browser and
 * camera app sends one.
 */
export function isBotUserAgent(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent.trim() : '';
  return ua === '' || isbot(ua);
}

/**
 * The scanner's preferred language from an Accept-Language header, as a
 * lowercase primary subtag: "en-ZA,en;q=0.9,af;q=0.8" → "en". Null if absent
 * or malformed. The first entry is the browser's top preference.
 */
export function parseLanguage(acceptLanguage) {
  if (typeof acceptLanguage !== 'string') return null;
  const first = acceptLanguage.split(',')[0].split(';')[0].trim();
  const primary = first.split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}
