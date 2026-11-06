/**
 * Shared, client-safe helpers for bulk QR code creation.
 *
 * Used by the bulk-create modal (to turn pasted/uploaded spreadsheet data into
 * rows and validate them before anything is sent) AND by the API routes (which
 * re-validate everything, since the client can't be trusted). Pure functions
 * only: no React, no database.
 */

import { csvRow, parseDelimitedText } from './csv';
import { validateCodeInput } from './codeInput';
import { normalizeDestinationUrl } from './qrStyle';

/**
 * Most codes one bulk request may create, whatever the package. Starter,
 * Business and Extended are capped by their own limits well below this; it
 * exists for Enterprise (unlimited), so a single request can't be unbounded.
 */
export const MAX_BULK_ROWS = 200;

/** Largest bulk request body the API will read. 200 rows is roughly 100 KB. */
export const MAX_BULK_BODY_BYTES = 1024 * 1024;

// ── Reading rows from pasted / uploaded text ──

// Column names recognised in a header row (English, plus Afrikaans since the
// spreadsheets this reads are often South African).
const TITLE_HEADERS = ['title', 'name', 'label', 'titel', 'naam'];
const URL_HEADERS = [
  'url', 'link', 'destination', 'destination url', 'website', 'target', 'target url',
  'skakel', 'webwerf', 'bestemming',
];

/** Does this cell look like a link (a dotted host/path or a scheme)? */
function looksLikeLink(text) {
  return text.includes('.') || text.includes('://');
}

function normalizeHeader(cell) {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Turn a parsed table into `{ title, destinationUrl }` rows.
 *
 * The first row is treated as a header when one of its cells is a recognised
 * column name (Title / Name / Label, URL / Link / Destination / Website …) and
 * none of its cells is a URL; its names then pick the columns, so extra columns
 * (such as a collection name) are ignored. Without a header the first column is
 * the title and the second the URL.
 *
 * A header in a language we don't know (say "Item,Address") is caught by shape
 * instead: a lone word such as "Address" is still a valid https host once
 * https:// is added, so left alone it would become a real code. So when the
 * first row's link cell is a single word with no dot, but a later row's link
 * cell is a real link, the first row is taken to be a header. (The caller tells
 * the user a header row was skipped.)
 */
export function rowsFromTable(table) {
  if (!Array.isArray(table) || table.length === 0) {
    return { rows: [], hasHeader: false };
  }

  const first = table[0].map(normalizeHeader);
  const titleIdx = first.findIndex((c) => TITLE_HEADERS.includes(c));
  const urlIdx = first.findIndex((c) => URL_HEADERS.includes(c));
  const looksLikeData = table[0].some((c) => /:\/\//.test(String(c)));
  let hasHeader = (titleIdx !== -1 || urlIdx !== -1) && !looksLikeData;

  if (!hasHeader && !looksLikeData && table.length >= 2) {
    const linkCell = (cells) => String(cells[1] ?? '').trim();
    const firstLink = linkCell(table[0]);
    hasHeader =
      firstLink !== '' &&
      !looksLikeLink(firstLink) &&
      table.slice(1).some((cells) => looksLikeLink(linkCell(cells)));
  }

  let titleCol = 0;
  let urlCol = 1;
  if (hasHeader) {
    if (titleIdx !== -1 && urlIdx !== -1) {
      titleCol = titleIdx;
      urlCol = urlIdx;
    } else if (titleIdx !== -1) {
      titleCol = titleIdx;
      urlCol = titleIdx === 0 ? 1 : 0;
    } else {
      urlCol = urlIdx;
      titleCol = urlIdx === 0 ? 1 : 0;
    }
  }

  const rows = table.slice(hasHeader ? 1 : 0).map((cells) => ({
    title: String(cells[titleCol] ?? '').trim(),
    destinationUrl: String(cells[urlCol] ?? '').trim(),
  }));

  return { rows, hasHeader };
}

/**
 * Parse pasted or uploaded spreadsheet/CSV text into rows.
 * Returns `{ rows, hasHeader, delimiter, unterminatedQuote }`.
 */
export function parseBulkText(text) {
  const { rows: table, delimiter, unterminatedQuote } = parseDelimitedText(text);
  const { rows, hasHeader } = rowsFromTable(table);
  return { rows, hasHeader, delimiter, unterminatedQuote };
}

// ── Validation ──

/**
 * Validate every row with the same rules as single-code creation.
 *
 * Returns `{ items, errors }`: `items[i]` is `{ title, destinationUrl }`
 * (cleaned) for a valid row or `null` for an invalid one, and `errors` is a
 * flat list of `{ row, field, message }` where `row` is the 0-based index into
 * `rows`. Callers decide whether any error blocks the whole batch.
 */
export function validateBulkRows(rows) {
  const items = [];
  const errors = [];

  rows.forEach((row, index) => {
    const result = validateCodeInput(row);
    if (result.ok) {
      items.push({ title: result.title, destinationUrl: result.destinationUrl });
    } else {
      items.push(null);
      for (const [field, message] of Object.entries(result.errors)) {
        errors.push({ row: index, field, message });
      }
    }
  });

  return { items, errors };
}

/**
 * Indexes of rows that repeat an earlier row's title and destination (compared
 * case-insensitively, after adding a missing https://). Repeats are allowed,
 * since every code gets its own link, but are usually an accidental double
 * paste, so the review screen warns about them.
 */
export function findDuplicateRows(rows) {
  const seen = new Set();
  const duplicates = [];

  rows.forEach((row, index) => {
    const title = String(row?.title ?? '').trim().toLowerCase();
    const url = normalizeDestinationUrl(String(row?.destinationUrl ?? '').trim()).toLowerCase();
    if (!title || !url) return;
    const key = `${title}\u0000${url}`;
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });

  return duplicates;
}

/**
 * How many more codes an account may create: `Infinity` on an unlimited
 * package, otherwise what's left under the limit (never negative — an account
 * can already be over a limit that was lowered).
 */
export function remainingCodes(limit, existingCount) {
  if (limit === null || limit === undefined) return Infinity;
  return Math.max(0, limit - existingCount);
}

// ── Exporting the created codes ──

/**
 * CSV of the codes a batch created (title, short link, destination), ready to
 * hand to a printer or paste into a spreadsheet. A leading byte-order mark
 * makes Excel read it as UTF-8, matching the analytics export.
 */
export function bulkCodesCsv(codes) {
  let out = '﻿' + csvRow(['Title', 'Short link', 'Destination URL']);
  for (const code of codes) {
    out += csvRow([code.title, code.redirectUrl, code.destinationUrl]);
  }
  return out;
}
