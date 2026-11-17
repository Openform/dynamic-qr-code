/**
 * The files a campaign page's calendar and contact buttons download: an
 * event (.ics, RFC 5545) and a contact card (.vcf, vCard 3.0, the version
 * iPhones and Android phones both read). They're built from a saved button's
 * fields after buttonFile() in lib/campaignPages.js has checked them again,
 * so every value is plain text with no control characters (line breaks only
 * in an event's details). Each value is still escaped for its format, so
 * nothing in it can start a new line or field.
 */

const CRLF = '\r\n';

/** Escape text for an iCalendar or vCard value: \ ; , and line breaks. */
function escapeValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to at most 75 bytes, as both formats ask: the rest
 * goes on lines that start with a space. Never splits a character.
 */
function fold(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, so they hold one byte less.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function lines(list) {
  return list.filter(Boolean).map(fold).join(CRLF) + CRLF;
}

/** An ISO time → iCalendar UTC, e.g. "20261206T080000Z". */
function icsTime(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * A calendar event from a calendar button's checked fields. `uid` names the
 * event so adding it again updates it rather than adding a copy. An event
 * with no end lasts an hour.
 */
export function eventFile(fields, { uid, nowMs = Date.now() }) {
  const end = fields.endsAt || new Date(new Date(fields.startsAt).getTime() + HOUR_MS).toISOString();
  return lines([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QR Go//Campaign page//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeValue(uid)}`,
    `DTSTAMP:${icsTime(new Date(nowMs).toISOString())}`,
    `DTSTART:${icsTime(fields.startsAt)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${escapeValue(fields.title)}`,
    fields.location && `LOCATION:${escapeValue(fields.location)}`,
    fields.details && `DESCRIPTION:${escapeValue(fields.details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]);
}

/** A contact card from a contact button's checked fields. */
export function contactFile(fields) {
  return lines([
    'BEGIN:VCARD',
    'VERSION:3.0',
    // The name goes in whole: it may be a person or a business.
    `N:${escapeValue(fields.name)};;;;`,
    `FN:${escapeValue(fields.name)}`,
    fields.organisation && `ORG:${escapeValue(fields.organisation)}`,
    fields.phone && `TEL;TYPE=VOICE:${escapeValue(fields.phone)}`,
    fields.email && `EMAIL;TYPE=INTERNET:${escapeValue(fields.email)}`,
    fields.website && `URL:${escapeValue(fields.website)}`,
    // The address as one line in the street part.
    fields.address && `ADR;TYPE=WORK:;;${escapeValue(fields.address)};;;;`,
    'END:VCARD',
  ]);
}

const FILE_TYPES = {
  ics: { contentType: 'text/calendar; charset=utf-8', fallback: 'event' },
  vcf: { contentType: 'text/vcard; charset=utf-8', fallback: 'contact' },
};

/** "<button id>.ics" or "<button id>.vcf" → `{ buttonId, type }`, or null. */
export function parseFileParam(value) {
  const match = /^([A-Za-z0-9_-]{1,32})\.(ics|vcf)$/.exec(String(value ?? ''));
  return match ? { buttonId: match[1], type: match[2] } : null;
}

/** A safe file name from the event's or contact's name, e.g. "summer-market.ics". */
export function fileName(name, type) {
  const base = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '');
  return `${base || FILE_TYPES[type].fallback}.${type}`;
}

/**
 * The response for a checked file button (`file` from buttonFile()):
 * a download, never cached, as the page can be edited at any time.
 */
export function fileResponse(file, { uid, nowMs = Date.now() }) {
  const body = file.type === 'ics' ? eventFile(file.fields, { uid, nowMs }) : contactFile(file.fields);
  const name = fileName(file.type === 'ics' ? file.fields.title : file.fields.name, file.type);
  return new Response(body, {
    headers: {
      'Content-Type': FILE_TYPES[file.type].contentType,
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
