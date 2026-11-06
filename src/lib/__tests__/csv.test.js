import { describe, it, expect } from 'vitest';
import { csvCell, csvRow, detectDelimiter, parseDelimitedText } from '../csv';

describe('csvCell / csvRow (writing)', () => {
  it('quotes cells containing commas, quotes or newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('defuses spreadsheet formulas in strings', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
  });

  it('ends a row with CRLF', () => {
    expect(csvRow(['a', 'b'])).toBe('a,b\r\n');
  });
});

describe('detectDelimiter', () => {
  it('prefers tab (a paste from a spreadsheet)', () => {
    expect(detectDelimiter('Title\tURL\nA\thttps://a.com/x,y')).toBe('\t');
  });

  it('picks semicolon when it outnumbers commas (Excel in some locales)', () => {
    expect(detectDelimiter('Title;URL\nA;b.com')).toBe(';');
  });

  it('defaults to comma', () => {
    expect(detectDelimiter('Title,URL')).toBe(',');
    expect(detectDelimiter('just one column')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });

  it('ignores delimiters inside quotes on the first line', () => {
    expect(detectDelimiter('"a;b;c",d')).toBe(',');
  });

  it('skips leading blank lines', () => {
    expect(detectDelimiter('\n\nTitle;URL')).toBe(';');
  });
});

describe('parseDelimitedText', () => {
  it('parses simple comma-separated rows', () => {
    const { rows, delimiter } = parseDelimitedText('a,b\nc,d');
    expect(delimiter).toBe(',');
    expect(rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles CRLF, LF and CR line endings', () => {
    expect(parseDelimitedText('a,b\r\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseDelimitedText('a,b\rc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('strips a leading byte-order mark', () => {
    expect(parseDelimitedText('﻿Title,URL\nA,b.com').rows[0]).toEqual(['Title', 'URL']);
  });

  it('handles quoted fields with delimiters, escaped quotes and newlines', () => {
    const { rows } = parseDelimitedText('"a, b","say ""hi""","two\nlines"');
    expect(rows).toEqual([['a, b', 'say "hi"', 'two\nlines']]);
  });

  it('skips blank lines and rows with only empty cells', () => {
    const { rows } = parseDelimitedText('a,b\n\n , \nc,d\n');
    expect(rows).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps empty cells so columns stay aligned', () => {
    expect(parseDelimitedText('a,,c').rows).toEqual([['a', '', 'c']]);
    expect(parseDelimitedText('a,b,').rows).toEqual([['a', 'b', '']]);
  });

  it('keeps commas inside URLs when the data is tab-separated', () => {
    const { rows } = parseDelimitedText('A\thttps://x.com/?q=1,2');
    expect(rows).toEqual([['A', 'https://x.com/?q=1,2']]);
  });

  it('treats a quote in the middle of a field literally', () => {
    const { rows, unterminatedQuote } = parseDelimitedText('a,https://x.com/p"q');
    expect(rows).toEqual([['a', 'https://x.com/p"q']]);
    expect(unterminatedQuote).toBe(false);
  });

  it('flags text that ends inside a quoted field', () => {
    const result = parseDelimitedText('a,"never closed\nb,c');
    expect(result.unterminatedQuote).toBe(true);
  });

  it('returns no rows for empty or non-string input', () => {
    expect(parseDelimitedText('').rows).toEqual([]);
    expect(parseDelimitedText('\n\n').rows).toEqual([]);
    expect(parseDelimitedText(null).rows).toEqual([]);
    expect(parseDelimitedText(undefined).rows).toEqual([]);
  });

  it('honours an explicit delimiter over detection', () => {
    expect(parseDelimitedText('a;b,c', ',').rows).toEqual([['a;b', 'c']]);
  });

  it('round-trips what csvRow writes', () => {
    const original = ['Plain', 'with, comma', 'with "quote"', 'multi\nline'];
    const { rows } = parseDelimitedText(csvRow(original));
    expect(rows).toEqual([original]);
  });
});
