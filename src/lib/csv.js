/**
 * Minimal CSV writing for analytics exports (RFC 4180, CRLF line endings).
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
