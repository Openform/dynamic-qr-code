/**
 * The legal pages (Privacy Policy, Terms & Conditions): which ones exist, and
 * checks for content saved from /admin/legal.
 *
 * Shared by the server and the browser, so this file must stay free of
 * server-only imports. Loading saved content is in legalContent.js.
 */

export const LEGAL_PAGES = [
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    path: '/privacy',
    description: 'How QR Go collects, uses and protects your information.',
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    path: '/terms',
    description: 'The terms that apply when you use QR Go.',
  },
];

/** Plenty for a legal page; stops accidental pastes of huge documents. */
export const MAX_LEGAL_CONTENT_LENGTH = 100_000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The page with this slug, or null. */
export function getLegalPageInfo(slug) {
  return LEGAL_PAGES.find((page) => page.slug === slug) ?? null;
}

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isValidDateString(value) {
  const match = typeof value === 'string' ? value.match(DATE_RE) : null;
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** "YYYY-MM-DD" for a Date, in UTC. */
function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Check the body of a save request: { content, lastUpdated }.
 * Returns { content, lastUpdated } ready to store, or { error }.
 *
 * The date comes from the admin's browser (their "today"), so it may be up to
 * a day ahead of the server's UTC date, but no further.
 */
export function validateLegalUpdate(body, now = Date.now()) {
  const content =
    typeof body?.content === 'string' ? body.content.replace(/\r\n?/g, '\n').trim() : '';
  if (!content) {
    return { error: "The page text can't be empty" };
  }
  if (content.length > MAX_LEGAL_CONTENT_LENGTH) {
    return {
      error: `The page text is too long (the limit is ${MAX_LEGAL_CONTENT_LENGTH.toLocaleString('en-ZA')} characters)`,
    };
  }

  const lastUpdated = typeof body?.lastUpdated === 'string' ? body.lastUpdated.trim() : '';
  if (!isValidDateString(lastUpdated)) {
    return { error: 'Choose a valid "Last updated" date' };
  }
  if (lastUpdated > utcDateString(new Date(now + DAY_MS))) {
    return { error: 'The "Last updated" date can\'t be in the future' };
  }

  return { content, lastUpdated };
}

const longDate = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-29" → "29 October 2026". */
export function formatLegalDate(value) {
  if (!isValidDateString(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  return longDate.format(Date.UTC(year, month - 1, day));
}
