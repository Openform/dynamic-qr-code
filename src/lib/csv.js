/**
 * Minimal CSV reading and writing: analytics and bulk-creation exports are
 * written as RFC 4180 with CRLF line endings, and bulk creation reads pasted or
 * uploaded spreadsheet data (comma-, semicolon- or tab-separated).
 */

// Cells starting with these are run as formulas by Excel / Google Sheets.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Escape one value for a CSV cell. Strings that a spreadsheet would treat as
 * a formula get a leading apostrophe, since QR code titles and city names
 * come from users and third parties.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** One CSV line, including the trailing CRLF. */
export function csvRow(values) {
  return values.map(csvCell).join(',') + '\r\n';
}

// ──────────────────────────────────────────────
// Reading
// ──────────────────────────────────────────────

/**
 * Guess the delimiter of pasted/uploaded text from its first non-blank line
 * (ignoring anything inside quotes): tab wins (a paste from Excel or Google
 * Sheets), then semicolon when it is more common than comma (Excel exports CSV
 * with semicolons in locales such as South Africa's), otherwise comma.
 */
export function detectDelimiter(text) {
  let tabs = 0;
  let semicolons = 0;
  let commas = 0;
  let inQuotes = false;
  let sawContent = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      sawContent = true;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (sawContent) break;
    } else if (!inQuotes && ch === '\t') {
      tabs++;
      sawContent = true;
    } else if (!inQuotes && ch === ';') {
      semicolons++;
      sawContent = true;
    } else if (!inQuotes && ch === ',') {
      commas++;
      sawContent = true;
    } else if (ch !== ' ') {
      sawContent = true;
    }
  }

  if (tabs > 0) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

/**
 * Parse delimited text into a table of strings.
 *
 * Handles a leading byte-order mark, quoted fields (with "" escapes and
 * embedded delimiters/newlines), and CRLF, LF or CR line endings. A quote only
 * opens a quoted field at the very start of a field, so a stray `"` inside a
 * URL is kept literally. Completely blank lines are skipped.
 *
 * Returns `{ rows, delimiter, unterminatedQuote }`. `unterminatedQuote` is true
 * when the text ended inside a quoted field, which usually means a stray quote
 * swallowed the rest of the data, so callers should warn.
 */
export function parseDelimitedText(input, delimiter) {
  let text = typeof input === 'string' ? input : '';
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = delimiter || detectDelimiter(text);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let quotedField = false;

  function endRow() {
    row.push(field);
    field = '';
    quotedField = false;
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '' && !quotedField) {
      inQuotes = true;
      quotedField = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
      quotedField = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }

  const unterminatedQuote = inQuotes;
  if (field !== '' || row.length > 0 || quotedField) endRow();

  return { rows, delimiter: delim, unterminatedQuote };
}
