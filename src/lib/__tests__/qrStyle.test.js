import { describe, it, expect } from 'vitest';
import { normalizeDestinationUrl, isValidDestinationUrl } from '../qrStyle';

describe('normalizeDestinationUrl', () => {
  it('prepends https:// when the scheme is omitted', () => {
    expect(normalizeDestinationUrl('example.com')).toBe('https://example.com');
    expect(normalizeDestinationUrl('example.com/path?q=1')).toBe(
      'https://example.com/path?q=1'
    );
    expect(normalizeDestinationUrl('example.com:8080')).toBe('https://example.com:8080');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeDestinationUrl('  example.com  ')).toBe('https://example.com');
  });

  it('leaves an existing scheme untouched', () => {
    expect(normalizeDestinationUrl('https://example.com')).toBe('https://example.com');
    // http is preserved here (validity is enforced by isValidDestinationUrl).
    expect(normalizeDestinationUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeDestinationUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  it('passes empty and non-string input through unchanged', () => {
    expect(normalizeDestinationUrl('')).toBe('');
    expect(normalizeDestinationUrl('   ')).toBe('');
    expect(normalizeDestinationUrl(undefined)).toBe(undefined);
    expect(normalizeDestinationUrl(null)).toBe(null);
  });
});

describe('isValidDestinationUrl', () => {
  it('accepts absolute https URLs', () => {
    expect(isValidDestinationUrl('https://example.com')).toBe(true);
    expect(isValidDestinationUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects http URLs', () => {
    expect(isValidDestinationUrl('http://example.com')).toBe(false);
  });

  it('rejects other schemes and malformed input', () => {
    expect(isValidDestinationUrl('ftp://example.com')).toBe(false);
    expect(isValidDestinationUrl('javascript:alert(1)')).toBe(false);
    expect(isValidDestinationUrl('example.com')).toBe(false); // not absolute
    expect(isValidDestinationUrl('')).toBe(false);
  });

  it('accepts scheme-less input once normalized', () => {
    expect(isValidDestinationUrl(normalizeDestinationUrl('example.com'))).toBe(true);
    expect(isValidDestinationUrl(normalizeDestinationUrl('http://example.com'))).toBe(false);
  });
});
