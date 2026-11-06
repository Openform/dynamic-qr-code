import { describe, it, expect } from 'vitest';
import { validateCodeInput, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from '../codeInput';

describe('validateCodeInput', () => {
  it('accepts a title and https URL, trimming and normalizing', () => {
    expect(validateCodeInput({ title: '  Menu  ', destinationUrl: ' https://example.com/menu ' })).toEqual({
      ok: true,
      title: 'Menu',
      destinationUrl: 'https://example.com/menu',
    });
  });

  it('adds https:// when the scheme is omitted', () => {
    const result = validateCodeInput({ title: 'Site', destinationUrl: 'example.com/a' });
    expect(result).toEqual({ ok: true, title: 'Site', destinationUrl: 'https://example.com/a' });
  });

  it('rejects plain http and other schemes', () => {
    expect(validateCodeInput({ title: 'x', destinationUrl: 'http://example.com' }).errors).toHaveProperty('destinationUrl');
    expect(validateCodeInput({ title: 'x', destinationUrl: 'ftp://example.com' }).errors).toHaveProperty('destinationUrl');
    expect(validateCodeInput({ title: 'x', destinationUrl: 'javascript:alert(1)' }).errors).toHaveProperty('destinationUrl');
  });

  it('requires both fields, reporting each missing one', () => {
    const result = validateCodeInput({ title: '', destinationUrl: '' });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['destinationUrl', 'title']);
  });

  it('treats a whitespace-only title as missing', () => {
    expect(validateCodeInput({ title: '   ', destinationUrl: 'a.com' }).errors).toHaveProperty('title');
  });

  it('treats non-string values as missing rather than coercing them', () => {
    expect(validateCodeInput({ title: { a: 1 }, destinationUrl: 'a.com' }).errors).toHaveProperty('title');
    expect(validateCodeInput({ title: 'x', destinationUrl: 12345 }).errors).toHaveProperty('destinationUrl');
    expect(validateCodeInput(null).ok).toBe(false);
    expect(validateCodeInput(undefined).ok).toBe(false);
    expect(validateCodeInput('a string').ok).toBe(false);
  });

  it('enforces the title length limit exactly', () => {
    const atLimit = 'a'.repeat(MAX_TITLE_LENGTH);
    expect(validateCodeInput({ title: atLimit, destinationUrl: 'a.com' }).ok).toBe(true);
    const over = validateCodeInput({ title: atLimit + 'a', destinationUrl: 'a.com' });
    expect(over.ok).toBe(false);
    expect(over.errors.title).toMatch(/255/);
  });

  it('enforces the URL length limit on the normalized URL', () => {
    const prefix = 'https://example.com/';
    const atLimit = prefix + 'a'.repeat(MAX_URL_LENGTH - prefix.length);
    expect(validateCodeInput({ title: 'x', destinationUrl: atLimit }).ok).toBe(true);
    const over = validateCodeInput({ title: 'x', destinationUrl: atLimit + 'a' });
    expect(over.ok).toBe(false);
    expect(over.errors.destinationUrl).toMatch(/2048/);
  });

  it('counts the added https:// toward the URL limit', () => {
    // 2043 chars + "https://" (8) = 2051 > 2048
    const longHost = 'a'.repeat(MAX_URL_LENGTH - 5) + '.com';
    expect(validateCodeInput({ title: 'x', destinationUrl: longHost }).ok).toBe(false);
  });
});
