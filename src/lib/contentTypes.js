/**
 * What a code does when it's scanned: open a website, write an email, call a
 * number, send a text, open a WhatsApp chat, show a place on a map, or join a
 * Wi-Fi network. Each kind of content is a "content type". (Not to be
 * confused with `codeType` in qrStyle.js, which is the symbology: QR or Data
 * Matrix.)
 *
 * There are three ways a type works:
 *
 *   'redirect' — the code holds the QR Go link (/r/…) and the scan is
 *     redirected to an https:// link: a website, wa.me or Google Maps.
 *   'action'   — the code holds the QR Go link and the scan lands on a small
 *     QR Go page (/r/…/open) with a button that opens a mailto:, tel: or sms:
 *     link. Browsers, and the in-app browsers of scanner apps, don't reliably
 *     follow a redirect straight to those, but they always follow a tap.
 *   'static'   — the content itself is in the image, because phones only act
 *     on it that way (a Wi-Fi network can't be joined from a web page). These
 *     scans never reach QR Go, so they can't be counted, and the image can't
 *     change after it's printed.
 *
 * Redirect and action types keep everything about where a scan goes in the
 * code's destination string (`destination_url`): the link is built here from
 * the form's fields, and the fields are read back from it for editing. So the
 * destination history, scheduled changes and per-destination analytics work
 * for them unchanged. Static types keep their content in `content_data`,
 * encrypted (lib/codeContent.js), and their destination is ''.
 *
 * Security: a link is only ever built here, from checked fields. Requests
 * can't supply a ready-made mailto:/tel:/sms: link, so no other scheme (like
 * javascript:) can get in, and no field can add parameters (like cc= or bcc=)
 * of its own. Every field rejects control characters and the invisible
 * characters that change text direction, which could make a page show one
 * address while the link goes to another.
 *
 * Shared by the API (to check requests) and the dashboard (to check the form
 * and draw previews), so this file must stay free of server-only imports.
 */

import { normalizeDestinationUrl, isValidDestinationUrl } from './qrStyle';

/** Every content type, in the order the dashboard offers them. */
export const CONTENT_TYPES = [
  { id: 'url', label: 'Website', kind: 'redirect' },
  { id: 'email', label: 'Email', kind: 'action' },
  { id: 'phone', label: 'Phone call', kind: 'action' },
  { id: 'sms', label: 'Text message', kind: 'action' },
  { id: 'whatsapp', label: 'WhatsApp', kind: 'redirect' },
  { id: 'location', label: 'Location', kind: 'redirect' },
  { id: 'wifi', label: 'Wi-Fi', kind: 'static' },
];

export const DEFAULT_CONTENT_TYPE = 'url';

const BY_ID = new Map(CONTENT_TYPES.map((t) => [t.id, t]));

/** Matches the destination_url columns (qrcodes, qrcode_destinations, scan_events). */
export const MAX_DESTINATION_LENGTH = 2048;

export const LIMITS = {
  title: 255, // qrcodes.title
  email: 254,
  emailLocalPart: 64,
  subject: 150,
  emailBody: 1000,
  smsBody: 300,
  whatsappMessage: 500,
  location: 200,
  ssidBytes: 32, // the most a Wi-Fi network name can be
};

export function isContentType(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * A content type by id. An unknown or missing id (e.g. a code created before
 * types existed) is a website, the only kind there was.
 */
export function getContentType(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_CONTENT_TYPE);
}

/** True for types whose content is in the image itself (no QR Go link). */
export function isStaticType(id) {
  return getContentType(id).kind === 'static';
}

/** True for types whose scans land on the QR Go action page (/r/…/open). */
export function isActionType(id) {
  return getContentType(id).kind === 'action';
}

/**
 * Schedules and scheduled destination changes send scans to another
 * website, so for now they're only for website codes.
 */
export function supportsSchedules(id) {
  return getContentType(id).id === 'url';
}

// ── Text checks ──

// C0 and C1 control characters, which no field needs.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// The same, but allowing tab and line breaks, for multi-line messages.
const CONTROL_EXCEPT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
// Characters that change text direction or are invisible formatting, which
// could make a page show text that doesn't match the link behind it.
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/;

function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Check one text field. Returns `{ value }` (trimmed unless `keepSpaces`) or
 * `{ error }`.
 */
function checkText(value, { label, max, required = false, multiline = false, keepSpaces = false }) {
  const raw = text(value);
  const v = keepSpaces ? raw : raw.trim();
  if (!v.trim()) {
    return required ? { error: `Enter ${label}.` } : { value: '' };
  }
  if ((multiline ? CONTROL_EXCEPT_LINES : CONTROL).test(v) || INVISIBLE.test(v)) {
    return { error: `${capitalize(label)} contains characters that aren't allowed.` };
  }
  if (v.length > max) {
    return { error: `${capitalize(label)} can be at most ${max} characters.` };
  }
  return { value: v };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Line breaks as \n, so stored and compared text is the same everywhere. */
function normalizeLines(s) {
  return s.replace(/\r\n?/g, '\n');
}

// ── Email ──

// A conservative address check: letters, digits and . _ + ' - before the @,
// and a domain of dot-separated labels. It leaves out the rare characters
// that would need escaping in a mailto: link (like % ? & and quotes), so the
// address can go into the link exactly as typed.
const EMAIL_LOCAL = /^[A-Za-z0-9._+'-]+$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isValidEmailAddress(value) {
  const v = text(value);
  if (v.length > LIMITS.email) return false;
  const at = v.lastIndexOf('@');
  if (at < 1 || at !== v.indexOf('@')) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > LIMITS.emailLocalPart || !EMAIL_LOCAL.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((l) => DOMAIN_LABEL.test(l))) return false;
  // The top-level domain is letters only (or an xn-- international one).
  const tld = labels[labels.length - 1];
  return /^[A-Za-z]{2,63}$/.test(tld) || /^xn--[A-Za-z0-9-]{1,59}$/.test(tld);
}

function parseEmail(input) {
  const to = text(input?.to).trim();
  if (!to) return fail('to', 'Enter the email address.');
  if (!isValidEmailAddress(to)) return fail('to', 'Enter a valid email address, like hello@example.com.');

  const subject = checkText(input?.subject, { label: 'the subject', max: LIMITS.subject });
  if (subject.error) return fail('subject', subject.error);
  const body = checkText(input?.body, { label: 'the message', max: LIMITS.emailBody, multiline: true });
  if (body.error) return fail('body', body.error);

  const content = { to, subject: subject.value, body: normalizeLines(body.value) };
  return withDestination('email', content);
}

function emailDestination({ to, subject, body }) {
  // Spaces must be %20 here, not "+": mail apps don't read "+" as a space.
  // Line breaks are sent as CRLF, as the mailto: standard (RFC 6068) asks.
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`);
  return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
}

// ── Phone numbers (calls, texts and WhatsApp) ──

/**
 * A phone number as typed → just its digits, with a leading + if it had one
 * (spaces, dashes, dots and brackets are dropped). Returns '' when anything
 * else is in it, like letters or the , and ; that make phones pause or dial
 * extra digits.
 */
export function cleanPhoneNumber(value) {
  const stripped = text(value).trim().replace(/[\s \-.()]/g, '');
  return /^\+?[0-9]+$/.test(stripped) ? stripped : '';
}

function parseNumber(value) {
  const raw = text(value).trim();
  if (!raw) return { error: 'Enter the phone number.' };
  const number = cleanPhoneNumber(raw);
  const digits = number.replace(/^\+/, '');
  if (!number || digits.length < 3 || digits.length > 15) {
    return { error: 'Enter a valid phone number, like +27 82 123 4567.' };
  }
  return { number };
}

function parsePhone(input) {
  const checked = parseNumber(input?.number);
  if (checked.error) return fail('number', checked.error);
  return withDestination('phone', { number: checked.number });
}

function parseSms(input) {
  const checked = parseNumber(input?.number);
  if (checked.error) return fail('number', checked.error);
  const message = checkText(input?.message, { label: 'the message', max: LIMITS.smsBody, multiline: true });
  if (message.error) return fail('message', message.error);
  return withDestination('sms', { number: checked.number, message: normalizeLines(message.value) });
}

function smsDestination({ number, message }) {
  return `sms:${number}${message ? `?body=${encodeURIComponent(message)}` : ''}`;
}

/**
 * WhatsApp needs the full international number: wa.me links take the digits
 * with the country code and no + or leading zeros.
 */
function parseWhatsApp(input) {
  const raw = text(input?.number).trim();
  if (!raw) return fail('number', 'Enter the WhatsApp number.');
  let number = cleanPhoneNumber(raw);
  if (number.startsWith('00')) number = `+${number.slice(2)}`;
  const digits = number.replace(/^\+/, '');
  if (!number || !/^[1-9][0-9]{7,14}$/.test(digits)) {
    return fail(
      'number',
      'Enter the number with its country code, like +27 82 123 4567.'
    );
  }
  const message = checkText(input?.message, {
    label: 'the message',
    max: LIMITS.whatsappMessage,
    multiline: true,
  });
  if (message.error) return fail('message', message.error);
  return withDestination('whatsapp', { number: `+${digits}`, message: normalizeLines(message.value) });
}

function whatsappDestination({ number, message }) {
  const digits = number.replace(/^\+/, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

// ── Location ──

function parseLocation(input) {
  const query = checkText(input?.query, { label: 'an address or place', max: LIMITS.location, required: true });
  if (query.error) return fail('query', query.error);
  return withDestination('location', { query: query.value });
}

// Google Maps' documented search link: opens the Maps app where it's
// installed (Android and iPhone) and the website everywhere else. The query
// can be an address, a place name or "latitude,longitude".
function locationDestination({ query }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// ── Website ──

function parseUrl(input) {
  const raw = text(input?.url).trim();
  if (!raw) return fail('url', 'Enter the destination URL.');
  const url = normalizeDestinationUrl(raw);
  if (!isValidDestinationUrl(url) || CONTROL.test(url) || INVISIBLE.test(url)) {
    return fail('url', 'Enter a valid URL. Only secure https:// links are allowed.');
  }
  if (url.length > MAX_DESTINATION_LENGTH) {
    return fail('url', `The URL can be at most ${MAX_DESTINATION_LENGTH} characters.`);
  }
  return { ok: true, content: { url }, destination: url };
}

// ── Wi-Fi ──

export const WIFI_SECURITY = [
  { id: 'WPA', label: 'WPA, WPA2 or WPA3' },
  { id: 'nopass', label: 'No password' },
];
// WEP isn't offered: it has been broken for years, and a network still on it
// should be upgraded rather than advertised on a printed code.

function utf8Length(s) {
  return new TextEncoder().encode(s).length;
}

function parseWifi(input) {
  // The network name and password are used exactly as typed (spaces too),
  // since they have to match the router's settings.
  const ssid = text(input?.ssid);
  if (!ssid.trim()) return fail('ssid', 'Enter the network name.');
  if (CONTROL.test(ssid) || INVISIBLE.test(ssid)) {
    return fail('ssid', "The network name contains characters that aren't allowed.");
  }
  if (utf8Length(ssid) > LIMITS.ssidBytes) {
    return fail('ssid', 'The network name can be at most 32 characters (fewer with accents or emoji).');
  }

  const security = WIFI_SECURITY.some((s) => s.id === input?.security) ? input.security : 'WPA';

  let password = '';
  if (security === 'WPA') {
    password = text(input?.password);
    if (!password) return fail('password', 'Enter the Wi-Fi password.');
    // A WPA password is 8–63 printable ASCII characters, or a 64-digit hex key.
    const isPassphrase = /^[\x20-\x7e]{8,63}$/.test(password);
    const isHexKey = /^[0-9A-Fa-f]{64}$/.test(password);
    if (!isPassphrase && !isHexKey) {
      return fail(
        'password',
        'A Wi-Fi password is 8 to 63 characters, using letters, numbers, spaces and standard symbols.'
      );
    }
  }

  const content = { ssid, security, password, hidden: input?.hidden === true };
  return { ok: true, content, destination: '' };
}

/** Backslash the characters that have a meaning in a WIFI: string. */
function escapeWifi(value) {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * The text a Wi-Fi code holds, in the format phone cameras read
 * (WIFI:T:WPA;S:name;P:password;;). Only call this with checked content.
 */
export function wifiPayload({ ssid, security, password, hidden }) {
  let s = `WIFI:T:${security === 'nopass' ? 'nopass' : 'WPA'};S:${escapeWifi(ssid)};`;
  if (security !== 'nopass') s += `P:${escapeWifi(password)};`;
  if (hidden) s += 'H:true;';
  return `${s};`;
}

// ── Putting it together ──

function fail(field, error) {
  return { ok: false, field, error };
}

const DESTINATION_BUILDERS = {
  email: emailDestination,
  phone: ({ number }) => `tel:${number}`,
  sms: smsDestination,
  whatsapp: whatsappDestination,
  location: locationDestination,
};

// The field whose length can push a type's link past the column's limit.
const LONGEST_FIELD = { email: 'body', sms: 'message', whatsapp: 'message', location: 'query' };

function withDestination(type, content) {
  const destination = DESTINATION_BUILDERS[type](content);
  if (destination.length > MAX_DESTINATION_LENGTH) {
    // Possible with long text in scripts that take several bytes per
    // character once it's encoded for the link.
    return fail(LONGEST_FIELD[type] ?? null, 'This is too long to fit in the code’s link. Please shorten it.');
  }
  return { ok: true, content, destination };
}

const PARSERS = {
  url: parseUrl,
  email: parseEmail,
  phone: parsePhone,
  sms: parseSms,
  whatsapp: parseWhatsApp,
  location: parseLocation,
  wifi: parseWifi,
};

/**
 * Check a code's content from a form or request (untrusted). `input` is an
 * object of the type's fields:
 *
 *   url      { url }
 *   email    { to, subject?, body? }
 *   phone    { number }
 *   sms      { number, message? }
 *   whatsapp { number, message? }
 *   location { query }
 *   wifi     { ssid, security ('WPA' | 'nopass'), password?, hidden? }
 *
 * Returns `{ ok: true, content, destination }` with the cleaned fields and
 * the destination to store ('' for static types), or `{ ok: false, field,
 * error }` with the field at fault and a message to show.
 */
export function parseContent(typeId, input) {
  if (!isContentType(typeId)) return fail(null, 'Choose what the code should do.');
  if (!input || typeof input !== 'object') input = {};
  return PARSERS[typeId](input);
}

/**
 * Read a redirect or action type's fields back from its stored destination,
 * for the edit form and the action page. Returns null when the destination
 * isn't one this type builds — then it must not be used.
 */
export function contentFromDestination(typeId, destination) {
  const type = getContentType(typeId);
  if (type.kind === 'static' || typeof destination !== 'string' || !destination) return null;
  let parsed;
  try {
    parsed = new URL(destination);
  } catch {
    return null;
  }
  const q = parsed.searchParams;
  let input;
  switch (type.id) {
    case 'url':
      input = { url: destination };
      break;
    case 'email':
      if (parsed.protocol !== 'mailto:') return null;
      input = { to: safeDecode(parsed.pathname), subject: q.get('subject') ?? '', body: q.get('body') ?? '' };
      break;
    case 'phone':
      if (parsed.protocol !== 'tel:') return null;
      input = { number: parsed.pathname };
      break;
    case 'sms':
      if (parsed.protocol !== 'sms:') return null;
      input = { number: parsed.pathname, message: q.get('body') ?? '' };
      break;
    case 'whatsapp':
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'wa.me') return null;
      input = { number: `+${parsed.pathname.slice(1)}`, message: q.get('text') ?? '' };
      break;
    case 'location':
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.google.com') return null;
      input = { query: q.get('query') ?? '' };
      break;
    default:
      return null;
  }
  // Rebuilding the link from the fields must give back exactly what's
  // stored, so only a destination built by this file is ever trusted.
  const checked = parseContent(type.id, input);
  return checked.ok && checked.destination === destination ? checked.content : null;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

/** The link a checked redirect or action type's content opens. */
export function destinationFor(typeId, content) {
  const checked = parseContent(typeId, content);
  return checked.ok ? checked.destination : null;
}

/**
 * What the image of a code holds: the QR Go link for redirect and action
 * types, or the content itself for static types. Returns null when a static
 * code's content is missing or invalid (so nothing is drawn).
 */
export function encodedDataFor(typeId, { redirectUrl, content }) {
  if (!isStaticType(typeId)) return redirectUrl;
  const checked = parseContent(typeId, content);
  return checked.ok ? wifiPayload(checked.content) : null;
}

/**
 * A short description of a code's content for cards and lists, as
 * `{ label, detail }` (e.g. "Email", "hello@example.com"). Never includes a
 * Wi-Fi password.
 */
export function describeContent(typeId, content) {
  const type = getContentType(typeId);
  const c = content ?? {};
  switch (type.id) {
    case 'email':
      return { label: type.label, detail: c.to ?? '' };
    case 'phone':
    case 'sms':
    case 'whatsapp':
      return { label: type.label, detail: c.number ?? '' };
    case 'location':
      return { label: type.label, detail: c.query ?? '' };
    case 'wifi':
      return { label: type.label, detail: c.ssid ?? '' };
    default:
      return { label: type.label, detail: displayLink(c.url) };
  }
}

function displayLink(url) {
  return String(url ?? '').replace(/^https?:\/\//i, '');
}

/**
 * A destination string as people read it: "Email hello@example.com" for a
 * mailto: link, "Call +27…" for tel:, "Text +27…" for sms:, and web links
 * without their https://. For lists of destinations (analytics, schedules)
 * that don't know which type made them.
 */
export function describeDestination(destination) {
  const d = String(destination ?? '');
  const scheme = /^(mailto|tel|sms):([^?]*)/i.exec(d);
  if (scheme) {
    const what = safeDecode(scheme[2]);
    const verb = { mailto: 'Email', tel: 'Call', sms: 'Text' }[scheme[1].toLowerCase()];
    return `${verb} ${what}`;
  }
  return displayLink(d);
}

/**
 * Check a code's title (an internal label, never shown to people who scan).
 * Returns `{ value }` or `{ error }`.
 */
export function checkTitle(value) {
  return checkText(value, { label: 'a title', max: LIMITS.title, required: true });
}
