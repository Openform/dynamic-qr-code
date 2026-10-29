import { describe, it, expect } from 'vitest';
import {
  LEGAL_PAGES,
  getLegalPageInfo,
  isValidDateString,
  validateLegalUpdate,
  formatLegalDate,
  MAX_LEGAL_CONTENT_LENGTH,
} from '../legal';
import { DEFAULT_LEGAL_CONTENT, DEFAULT_LAST_UPDATED } from '../legalDefaults';
import { parseMarkdown } from '../markdown';

const NOW = Date.UTC(2026, 9, 29, 12); // 29 Oct 2026, 12:00 UTC

describe('legal pages', () => {
  it('has placeholder text for every page', () => {
    for (const page of LEGAL_PAGES) {
      const blocks = parseMarkdown(DEFAULT_LEGAL_CONTENT[page.slug]);
      expect(blocks.filter((b) => b.type === 'heading').length).toBeGreaterThan(5);
    }
    expect(isValidDateString(DEFAULT_LAST_UPDATED)).toBe(true);
  });

  it('only knows the listed pages', () => {
    expect(getLegalPageInfo('privacy').path).toBe('/privacy');
    expect(getLegalPageInfo('terms').title).toBe('Terms & Conditions');
    expect(getLegalPageInfo('cookies')).toBeNull();
    expect(getLegalPageInfo('__proto__')).toBeNull();
  });
});

describe('isValidDateString', () => {
  it('accepts real dates only', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-2-3')).toBe(false);
    expect(isValidDateString('1999-12-31')).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });
});

describe('validateLegalUpdate', () => {
  it('returns trimmed text with Unix line endings', () => {
    expect(validateLegalUpdate({ content: '\n## Hi\r\nthere \n', lastUpdated: '2026-10-29' }, NOW)).toEqual({
      content: '## Hi\nthere',
      lastUpdated: '2026-10-29',
    });
  });

  it('rejects empty or overly long text', () => {
    expect(validateLegalUpdate({ content: '  ', lastUpdated: '2026-10-29' }, NOW).error).toBeTruthy();
    expect(validateLegalUpdate({ lastUpdated: '2026-10-29' }, NOW).error).toBeTruthy();
    const long = 'a'.repeat(MAX_LEGAL_CONTENT_LENGTH + 1);
    expect(validateLegalUpdate({ content: long, lastUpdated: '2026-10-29' }, NOW).error).toMatch(/too long/);
  });

  it('allows today in time zones ahead of UTC, but not later dates', () => {
    expect(validateLegalUpdate({ content: 'x', lastUpdated: '2026-10-30' }, NOW).error).toBeUndefined();
    expect(validateLegalUpdate({ content: 'x', lastUpdated: '2026-10-31' }, NOW).error).toMatch(/future/);
  });

  it('rejects a missing or invalid date', () => {
    expect(validateLegalUpdate({ content: 'x' }, NOW).error).toBeTruthy();
    expect(validateLegalUpdate({ content: 'x', lastUpdated: '29/10/2026' }, NOW).error).toBeTruthy();
    expect(validateLegalUpdate(null, NOW).error).toBeTruthy();
  });
});

describe('formatLegalDate', () => {
  it('writes the date out in full', () => {
    expect(formatLegalDate('2026-10-29')).toBe('29 October 2026');
    expect(formatLegalDate('nope')).toBe('');
  });
});
