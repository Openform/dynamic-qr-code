import { describe, it, expect } from 'vitest';
import { parseAccessPassword, ACCESS_PASSWORD_MIN, ACCESS_PASSWORD_MAX } from '../accessPassword';

describe('parseAccessPassword', () => {
  it('keeps a password, without spaces at either end', () => {
    expect(parseAccessPassword('  tea for two ')).toEqual({ value: 'tea for two' });
  });

  it('treats null, empty and blank as no password', () => {
    expect(parseAccessPassword(null)).toEqual({ value: null });
    expect(parseAccessPassword(undefined)).toEqual({ value: null });
    expect(parseAccessPassword('')).toEqual({ value: null });
    expect(parseAccessPassword('   ')).toEqual({ value: null });
  });

  it('needs at least the minimum length', () => {
    expect(ACCESS_PASSWORD_MIN).toBe(4);
    expect(parseAccessPassword('abc').error).toMatch(/at least 4/);
    expect(parseAccessPassword(' abc ').error).toMatch(/at least 4/);
    expect(parseAccessPassword('abcd')).toEqual({ value: 'abcd' });
  });

  it('allows up to the column width, counting an emoji as one character', () => {
    expect(ACCESS_PASSWORD_MAX).toBe(64);
    const longest = 'P'.repeat(63) + '🔑'; // 65 UTF-16 units, 64 characters
    expect(parseAccessPassword(longest)).toEqual({ value: longest });
    expect(parseAccessPassword('P'.repeat(65)).error).toMatch(/at most 64/);
  });

  it('refuses tabs, line breaks and other control characters', () => {
    expect(parseAccessPassword('tea\tfor two').error).toMatch(/tabs or line breaks/);
    expect(parseAccessPassword('tea\nfor two').error).toMatch(/tabs or line breaks/);
    expect(parseAccessPassword('tea\u0000two').error).toMatch(/tabs or line breaks/);
  });

  it('refuses anything that isn’t text', () => {
    expect(parseAccessPassword(1234).error).toMatch(/text/);
    expect(parseAccessPassword({}).error).toMatch(/text/);
    expect(parseAccessPassword(true).error).toMatch(/text/);
  });
});
