import { describe, it, expect } from 'vitest';
import {
  MAX_BULK_ROWS,
  BULK_UNDO_WINDOW_MINUTES,
  rowsFromTable,
  parseBulkText,
  validateBulkRows,
  findDuplicateRows,
  remainingCodes,
  bulkCodesCsv,
} from '../bulk';
import { parseDelimitedText } from '../csv';

describe('constants', () => {
  it('keeps sensible bounds', () => {
    expect(MAX_BULK_ROWS).toBe(200);
    expect(BULK_UNDO_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});

describe('rowsFromTable', () => {
  it('reads title then URL when there is no header', () => {
    const { rows, hasHeader } = rowsFromTable([
      ['Menu', 'example.com/menu'],
      ['Wine list', 'example.com/wine'],
    ]);
    expect(hasHeader).toBe(false);
    expect(rows).toEqual([
      { title: 'Menu', destinationUrl: 'example.com/menu' },
      { title: 'Wine list', destinationUrl: 'example.com/wine' },
    ]);
  });

  it('detects and drops a header row', () => {
    const { rows, hasHeader } = rowsFromTable([
      ['Title', 'URL'],
      ['Menu', 'example.com'],
    ]);
    expect(hasHeader).toBe(true);
    expect(rows).toEqual([{ title: 'Menu', destinationUrl: 'example.com' }]);
  });

  it('uses header names to find the columns, ignoring extra ones', () => {
    const { rows } = rowsFromTable([
      ['Collection', 'Destination URL', 'Name'],
      ['PPECB', 'example.com/a', 'Alpha'],
    ]);
    expect(rows).toEqual([{ title: 'Alpha', destinationUrl: 'example.com/a' }]);
  });

  it('recognises header names regardless of case, spacing and punctuation', () => {
    const { rows, hasHeader } = rowsFromTable([
      ['  LABEL ', 'destination_url'],
      ['A', 'a.com'],
    ]);
    expect(hasHeader).toBe(true);
    expect(rows).toEqual([{ title: 'A', destinationUrl: 'a.com' }]);
  });

  it('does not mistake a data row for a header when it contains a URL', () => {
    const { rows, hasHeader } = rowsFromTable([['Name', 'https://example.com']]);
    expect(hasHeader).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('falls back to the neighbouring column when only one header is recognised', () => {
    const { rows } = rowsFromTable([
      ['Title', 'Link text'],
      ['A', 'a.com'],
    ]);
    expect(rows).toEqual([{ title: 'A', destinationUrl: 'a.com' }]);
  });

  it('pads missing cells with empty strings', () => {
    const { rows } = rowsFromTable([['Only a title']]);
    expect(rows).toEqual([{ title: 'Only a title', destinationUrl: '' }]);
  });

  it('trims whitespace from cells', () => {
    const { rows } = rowsFromTable([['  A  ', '  a.com  ']]);
    expect(rows).toEqual([{ title: 'A', destinationUrl: 'a.com' }]);
  });

  it('recognises Afrikaans header names, including swapped columns', () => {
    const { rows, hasHeader } = rowsFromTable([
      ['Webwerf', 'Titel'],
      ['example.com/a', 'Alpha'],
    ]);
    expect(hasHeader).toBe(true);
    expect(rows).toEqual([{ title: 'Alpha', destinationUrl: 'example.com/a' }]);
  });

  describe('a header in a language we do not know', () => {
    it('is skipped when its link cell is one word and later rows have real links', () => {
      // "Skakel" would otherwise validate as https://Skakel and become a real code.
      for (const header of [['Naam', 'Skakel'], ['Item', 'Address'], ['Produk', 'Kode']]) {
        const { rows, hasHeader } = rowsFromTable([
          header,
          ['Kaffee', 'example.com/k'],
          ['Menu', 'https://example.com/menu'],
        ]);
        expect(hasHeader).toBe(true);
        expect(rows.map((r) => r.title)).toEqual(['Kaffee', 'Menu']);
      }
    });

    it('is also caught when the data rows are the only ones with a scheme', () => {
      const { hasHeader } = rowsFromTable([
        ['Etiket', 'Bestemmeling'],
        ['A', 'https://a.example'],
      ]);
      expect(hasHeader).toBe(true);
    });

    it('does not drop a genuine first row that has a real link', () => {
      const { rows, hasHeader } = rowsFromTable([
        ['Menu', 'qrgo.co.za/menu'],
        ['Wine', 'qrgo.co.za/wine'],
      ]);
      expect(hasHeader).toBe(false);
      expect(rows).toHaveLength(2);
    });

    it('does not guess when no row has a real link (all single words)', () => {
      const { rows, hasHeader } = rowsFromTable([
        ['A', 'intranet'],
        ['B', 'wiki'],
      ]);
      expect(hasHeader).toBe(false);
      expect(rows).toHaveLength(2);
    });

    it('does not guess when the first row has no link at all', () => {
      // Left for validation to flag as a missing link, not silently dropped.
      const { rows, hasHeader } = rowsFromTable([
        ['Produk', ''],
        ['Kaffee', 'example.com/k'],
      ]);
      expect(hasHeader).toBe(false);
      expect(rows).toHaveLength(2);
    });

    it('does not guess from a single row', () => {
      expect(rowsFromTable([['Produk', 'Kode']]).hasHeader).toBe(false);
    });

    it('still recognises a known Afrikaans header by name, even on its own', () => {
      expect(rowsFromTable([['Naam', 'Skakel']]).hasHeader).toBe(true);
    });
  });

  it('returns nothing for an empty table', () => {
    expect(rowsFromTable([])).toEqual({ rows: [], hasHeader: false });
    expect(rowsFromTable(undefined)).toEqual({ rows: [], hasHeader: false });
  });
});

describe('parseBulkText', () => {
  it('parses a semicolon CSV exported from Excel, with BOM and CRLF', () => {
    const text = '﻿Title;URL\r\nMenu;example.com/menu\r\n"Wine; reds";example.com/wine\r\n';
    const result = parseBulkText(text);
    expect(result.delimiter).toBe(';');
    expect(result.hasHeader).toBe(true);
    expect(result.rows).toEqual([
      { title: 'Menu', destinationUrl: 'example.com/menu' },
      { title: 'Wine; reds', destinationUrl: 'example.com/wine' },
    ]);
  });

  it('parses a paste from a spreadsheet (tab-separated)', () => {
    const result = parseBulkText('Menu\texample.com/menu\nWine\texample.com/wine');
    expect(result.delimiter).toBe('\t');
    expect(result.rows).toHaveLength(2);
  });

  it('skips an Afrikaans header from a South African Excel export (semicolons, BOM)', () => {
    const text = '\uFEFFNaam;Skakel\r\nKaffee Müller;example.com/kaffee\r\nSão Paulo;example.com/sp\r\n';
    const result = parseBulkText(text);
    expect(result.hasHeader).toBe(true);
    expect(result.rows).toEqual([
      { title: 'Kaffee Müller', destinationUrl: 'example.com/kaffee' },
      { title: 'São Paulo', destinationUrl: 'example.com/sp' },
    ]);
  });

  it('passes the unterminated-quote warning through', () => {
    expect(parseBulkText('a,"oops').unterminatedQuote).toBe(true);
  });

  it('agrees with the underlying parser on an empty paste', () => {
    expect(parseBulkText('').rows).toEqual([]);
    expect(parseDelimitedText('').rows).toEqual([]);
  });
});

describe('validateBulkRows', () => {
  it('returns cleaned items for valid rows', () => {
    const { items, errors } = validateBulkRows([
      { title: ' A ', destinationUrl: 'a.com' },
      { title: 'B', destinationUrl: 'https://b.com/x' },
    ]);
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { title: 'A', destinationUrl: 'https://a.com' },
      { title: 'B', destinationUrl: 'https://b.com/x' },
    ]);
  });

  it('reports every error with its row index and field, keeping valid rows', () => {
    const { items, errors } = validateBulkRows([
      { title: 'Ok', destinationUrl: 'ok.com' },
      { title: '', destinationUrl: 'http://insecure.com' },
      { title: 'No url', destinationUrl: '' },
    ]);
    expect(items[0]).toEqual({ title: 'Ok', destinationUrl: 'https://ok.com' });
    expect(items[1]).toBeNull();
    expect(items[2]).toBeNull();
    expect(errors.map((e) => `${e.row}:${e.field}`)).toEqual([
      '1:title',
      '1:destinationUrl',
      '2:destinationUrl',
    ]);
    for (const e of errors) expect(typeof e.message).toBe('string');
  });

  it('rejects rows that are not objects without throwing', () => {
    const { items, errors } = validateBulkRows([null, 'text', 42, { title: 'A', destinationUrl: 'a.com' }]);
    expect(items.slice(0, 3)).toEqual([null, null, null]);
    expect(items[3]).not.toBeNull();
    expect(errors.some((e) => e.row === 0)).toBe(true);
  });

  it('handles an empty list', () => {
    expect(validateBulkRows([])).toEqual({ items: [], errors: [] });
  });
});

describe('findDuplicateRows', () => {
  it('flags repeats of an earlier row, not the first occurrence', () => {
    const rows = [
      { title: 'A', destinationUrl: 'a.com' },
      { title: 'B', destinationUrl: 'b.com' },
      { title: 'a', destinationUrl: 'https://A.com' },
      { title: 'A', destinationUrl: 'a.com' },
    ];
    expect(findDuplicateRows(rows)).toEqual([2, 3]);
  });

  it('does not treat the same URL with a different title as a duplicate', () => {
    expect(
      findDuplicateRows([
        { title: 'A', destinationUrl: 'a.com' },
        { title: 'B', destinationUrl: 'a.com' },
      ])
    ).toEqual([]);
  });

  it('ignores incomplete rows', () => {
    expect(
      findDuplicateRows([
        { title: '', destinationUrl: '' },
        { title: '', destinationUrl: '' },
      ])
    ).toEqual([]);
  });
});

describe('remainingCodes', () => {
  it('is unlimited when the package has no limit', () => {
    expect(remainingCodes(null, 500)).toBe(Infinity);
    expect(remainingCodes(undefined, 0)).toBe(Infinity);
  });

  it('subtracts existing codes from the limit', () => {
    expect(remainingCodes(20, 5)).toBe(15);
    expect(remainingCodes(5, 5)).toBe(0);
  });

  it('never goes negative for an account already over its limit', () => {
    expect(remainingCodes(5, 9)).toBe(0);
  });
});

describe('bulkCodesCsv', () => {
  it('starts with a BOM and header and writes one line per code', () => {
    const csv = bulkCodesCsv([
      { title: 'Menu', redirectUrl: 'https://qr.example/r/abc', destinationUrl: 'https://example.com/menu' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      'Title,Short link,Destination URL\r\nMenu,https://qr.example/r/abc,https://example.com/menu\r\n'
    );
  });

  it('escapes commas and neutralises formulas in titles', () => {
    const csv = bulkCodesCsv([
      { title: '=HYPERLINK("x")', redirectUrl: 'https://q/r/1', destinationUrl: 'https://a.com' },
      { title: 'A, B', redirectUrl: 'https://q/r/2', destinationUrl: 'https://b.com' },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"A, B"');
  });

  it('is just the header for no codes', () => {
    expect(bulkCodesCsv([]).slice(1)).toBe('Title,Short link,Destination URL\r\n');
  });
});
