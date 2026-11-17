/**
 * Reports from "Report this page" on a campaign page, and what admins do
 * about them (/admin/reports). Browser-safe: the admin screen uses the reason
 * labels too.
 *
 * A report holds only a reason and an optional message, never who sent it:
 * the visitor's IP address is used for the rate limit in memory and not
 * stored. Reports are saved in campaign_page_reports (lib/db.js).
 */

import { buttonLink } from './campaignPages';
import { isSafeHref } from './markdown';

/** Why a visitor reports a page, in the order the form lists them. */
export const REPORT_REASONS = [
  { id: 'scam', label: 'It’s a scam, or asks for passwords or bank details' },
  { id: 'impersonation', label: 'It pretends to be a business or person it isn’t' },
  { id: 'illegal', label: 'It sells or promotes something illegal' },
  { id: 'harmful', label: 'It’s hateful, violent or sexual' },
  { id: 'rights', label: 'It uses my photos, brand or work without permission' },
  { id: 'other', label: 'Something else' },
];

/** Short names for the admin screen and the alert email. */
export const REASON_NAMES = {
  scam: 'Scam or phishing',
  impersonation: 'Impersonation',
  illegal: 'Illegal goods or activity',
  harmful: 'Hateful, violent or sexual',
  rights: 'Uses someone’s work or brand',
  other: 'Something else',
};

/** The most characters a report's message can have (the column holds 1000). */
export const REPORT_MESSAGE_MAX = 1000;

/** A form field people leave empty and simple bots fill in. */
export const REPORT_HONEYPOT = 'website';

/** True when the hidden field was filled in, so the report is dropped. */
export function isLikelyBot(fields) {
  const value = fields?.[REPORT_HONEYPOT];
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Check a submitted report: `{ reason, message? }`. Returns `{ reason,
 * message }` ready to save (no message as null) or `{ error }`, one of
 * 'reason' or 'message'. Line breaks in the message are kept; other control
 * characters are dropped.
 */
export function validatePageReport(fields) {
  const reason = typeof fields?.reason === 'string' ? fields.reason.trim() : '';
  if (!REPORT_REASONS.some((r) => r.id === reason)) return { error: 'reason' };

  const raw = typeof fields?.message === 'string' ? fields.message : '';
  const message = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if ([...message].length > REPORT_MESSAGE_MAX) return { error: 'message' };
  return { reason, message: message || null };
}

/**
 * What an admin can do with a reported page (PATCH /api/admin/pages/[id]):
 * take it down (which closes its open reports), restore it, or close its
 * reports and leave it up.
 */
export const PAGE_ACTIONS = ['take-down', 'restore', 'close-reports'];

/**
 * Reports (from getPageReports in lib/db.js, as the admin screen gets them)
 * grouped by page, pages with the newest report first. Each group is the
 * page's details and its reports, newest first, split into open and closed.
 */
export function groupReportsByPage(reports) {
  const pages = new Map();
  for (const report of reports) {
    if (!pages.has(report.pageId)) {
      pages.set(report.pageId, { ...report.page, id: report.pageId, open: [], closed: [], latestAt: report.createdAt });
    }
    const page = pages.get(report.pageId);
    (report.handledAt ? page.closed : page.open).push(report);
    if (report.createdAt > page.latestAt) page.latestAt = report.createdAt;
  }
  for (const page of pages.values()) {
    page.open.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    page.closed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return [...pages.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** The links written in a Text block or an answer, as they'd be drawn. */
function markdownLinks(text, where) {
  return [...String(text ?? '').matchAll(MARKDOWN_LINK)]
    .filter((match) => isSafeHref(match[2]))
    .map((match) => ({ where, label: match[1], href: match[2].trim() }));
}

/**
 * Where everything on a page leads, for admins judging a report: `[{ where,
 * label, href }]` for each button, linked photo and link in text, in page
 * order. Calendar and contact buttons have no link; their `href` says what
 * they download instead. `blocks` are the ones visitors see (pageView()).
 */
export function linksOnPage(blocks) {
  const links = [];
  for (const block of blocks ?? []) {
    if (block.type === 'buttons') {
      for (const button of block.items ?? []) {
        const fields = button.fields ?? {};
        const href =
          buttonLink(button) ??
          (button.kind === 'calendar'
            ? `Calendar event: ${fields.title || 'untitled'}`
            : button.kind === 'contact'
              ? `Contact card: ${[fields.name, fields.phone, fields.email, fields.website].filter(Boolean).join(', ')}`
              : null);
        if (href) links.push({ where: 'Button', label: button.label, href });
      }
    } else if (block.type === 'image' && block.link) {
      links.push({ where: 'Photo', label: block.alt || block.caption || 'Photo', href: block.link });
    } else if (block.type === 'text') {
      links.push(...markdownLinks(block.text, 'Text'));
    } else if (block.type === 'faq') {
      for (const item of block.items ?? []) links.push(...markdownLinks(item.answer, 'FAQ'));
    }
  }
  return links;
}
