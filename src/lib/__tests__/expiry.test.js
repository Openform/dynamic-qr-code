import { describe, it, expect } from 'vitest';
import {
  parseExpiresAt,
  toMysqlUtc,
  expiresAtToIso,
  isExpired,
  endOfLocalDayIso,
  isoToLocalDateInput,
  todayLocalDateInput,
  formatExpiryDate,
  EXPIRY_ERRORS,
} from '../expiry.js';

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0); // 2026-11-06 12:00:00 UTC

describe('parseExpiresAt', () => {
  it('leaves the expiry alone when the field is missing', () => {
    expect(parseExpiresAt(undefined, NOW)).toEqual({ ok: true, value: undefined });
  });

  it('clears the expiry for null or an empty string', () => {
    expect(parseExpiresAt(null, NOW)).toEqual({ ok: true, value: null });
    expect(parseExpiresAt('', NOW)).toEqual({ ok: true, value: null });
  });

  it('converts a future UTC moment to a MySQL UTC string', () => {
    expect(parseExpiresAt('2026-12-01T21:59:59.000Z', NOW)).toEqual({
      ok: true,
      value: '2026-12-01 21:59:59',
    });
  });

  it('converts other zones to UTC', () => {
    expect(parseExpiresAt('2026-12-01T23:59:59+02:00', NOW)).toEqual({
      ok: true,
      value: '2026-12-01 21:59:59',
    });
    expect(parseExpiresAt('2026-12-01T23:59:59-05:00', NOW)).toEqual({
      ok: true,
      value: '2026-12-02 04:59:59',
    });
  });

  it('accepts a value without seconds, and drops fractions of a second', () => {
    expect(parseExpiresAt('2026-12-01T10:30Z', NOW).value).toBe('2026-12-01 10:30:00');
    expect(parseExpiresAt('2026-12-01T10:30:15.987Z', NOW).value).toBe('2026-12-01 10:30:15');
  });

  it('refuses a moment that is now or in the past', () => {
    const past = { ok: false, error: EXPIRY_ERRORS.past };
    expect(parseExpiresAt('2026-11-06T12:00:00Z', NOW)).toEqual(past);
    expect(parseExpiresAt('2026-11-06T11:59:59Z', NOW)).toEqual(past);
    expect(parseExpiresAt('2020-01-01T00:00:00Z', NOW)).toEqual(past);
    expect(parseExpiresAt('2026-11-06T12:00:01Z', NOW).ok).toBe(true);
  });

  it('refuses anything without an explicit time zone, so the server zone never matters', () => {
    const invalid = { ok: false, error: EXPIRY_ERRORS.invalid };
    expect(parseExpiresAt('2026-12-01T10:00:00', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01 10:00:00', NOW)).toEqual(invalid);
  });

  it('refuses text that is not a date', () => {
    const invalid = { ok: false, error: EXPIRY_ERRORS.invalid };
    expect(parseExpiresAt('tomorrow', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-13-01T00:00:00Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01T25:00:00Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01T10:61:00Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01T10:00:60Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2026-12-01T10:00:00+24:00', NOW)).toEqual(invalid);
  });

  it('refuses days that do not exist instead of rolling them into the next month', () => {
    const invalid = { ok: false, error: EXPIRY_ERRORS.invalid };
    expect(parseExpiresAt('2026-02-31T10:00:00Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2027-02-29T10:00:00Z', NOW)).toEqual(invalid);
    expect(parseExpiresAt('2028-02-29T10:00:00Z', NOW).ok).toBe(true); // leap year
  });

  it('refuses values that are not strings', () => {
    const invalid = { ok: false, error: EXPIRY_ERRORS.invalid };
    expect(parseExpiresAt(1798848000000, NOW)).toEqual(invalid);
    expect(parseExpiresAt({}, NOW)).toEqual(invalid);
    expect(parseExpiresAt(true, NOW)).toEqual(invalid);
  });

  it('refuses dates the database column cannot hold', () => {
    const invalid = { ok: false, error: EXPIRY_ERRORS.invalid };
    expect(parseExpiresAt('9999-12-31T23:59:59Z', NOW).value).toBe('9999-12-31 23:59:59');
    // Still year 9999 in this zone, but 10000 once converted to UTC.
    expect(parseExpiresAt('9999-12-31T23:59:59-05:00', NOW)).toEqual(invalid);
  });
});

describe('toMysqlUtc', () => {
  it('formats a moment as YYYY-MM-DD HH:MM:SS in UTC', () => {
    expect(toMysqlUtc(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05');
  });
});

describe('expiresAtToIso', () => {
  it('reads a stored UTC DATETIME string as UTC', () => {
    expect(expiresAtToIso('2026-12-01 21:59:59')).toBe('2026-12-01T21:59:59.000Z');
  });

  it('round-trips with parseExpiresAt', () => {
    const { value } = parseExpiresAt('2026-12-01T23:59:59+02:00', NOW);
    expect(expiresAtToIso(value)).toBe('2026-12-01T21:59:59.000Z');
  });

  it('returns null when there is no usable expiry', () => {
    expect(expiresAtToIso(null)).toBeNull();
    expect(expiresAtToIso(undefined)).toBeNull();
    expect(expiresAtToIso('')).toBeNull();
    expect(expiresAtToIso('0000-00-00 00:00:00')).toBeNull();
    expect(expiresAtToIso('garbage')).toBeNull();
  });

  it('also accepts a Date', () => {
    expect(expiresAtToIso(new Date('2026-12-01T21:59:59Z'))).toBe('2026-12-01T21:59:59.000Z');
    expect(expiresAtToIso(new Date('nope'))).toBeNull();
  });
});

describe('isExpired', () => {
  it('is false without an expiry', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isExpired('', NOW)).toBe(false);
  });

  it('turns true at the expiry moment', () => {
    expect(isExpired('2026-11-06T12:00:01.000Z', NOW)).toBe(false);
    expect(isExpired('2026-11-06T12:00:00.000Z', NOW)).toBe(true);
    expect(isExpired('2026-11-06T11:00:00.000Z', NOW)).toBe(true);
  });

  it('is false for an unreadable value rather than switching the code off', () => {
    expect(isExpired('garbage', NOW)).toBe(false);
  });
});

describe('calendar dates in the viewer\'s time zone', () => {
  it('sends the last second of the chosen day', () => {
    const iso = endOfLocalDayIso('2026-11-30');
    const date = new Date(iso);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 30]);
    expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([23, 59, 59]);
  });

  it('survives the trip to the database and back to the same calendar date', () => {
    const iso = endOfLocalDayIso('2026-11-30');
    const stored = parseExpiresAt(iso, NOW).value;
    expect(isoToLocalDateInput(expiresAtToIso(stored))).toBe('2026-11-30');
  });

  it('handles the start and end of a year', () => {
    expect(isoToLocalDateInput(endOfLocalDayIso('2026-12-31'))).toBe('2026-12-31');
    expect(isoToLocalDateInput(endOfLocalDayIso('2027-01-01'))).toBe('2027-01-01');
    expect(isoToLocalDateInput(endOfLocalDayIso('2028-02-29'))).toBe('2028-02-29');
  });

  it('rejects dates that are not real', () => {
    expect(endOfLocalDayIso('2026-02-31')).toBeNull();
    expect(endOfLocalDayIso('2026-13-01')).toBeNull();
    expect(endOfLocalDayIso('30/11/2026')).toBeNull();
    expect(endOfLocalDayIso('')).toBeNull();
    expect(endOfLocalDayIso(undefined)).toBeNull();
  });

  it('shows no date when there is no expiry', () => {
    expect(isoToLocalDateInput(null)).toBe('');
    expect(isoToLocalDateInput('')).toBe('');
    expect(isoToLocalDateInput('garbage')).toBe('');
  });

  it('works out today in the viewer\'s zone', () => {
    const now = new Date(2026, 10, 6, 15, 30).getTime();
    expect(todayLocalDateInput(now)).toBe('2026-11-06');
    // A single-digit month and day are zero-padded, so dates compare as text.
    expect(todayLocalDateInput(new Date(2026, 0, 5, 9).getTime())).toBe('2026-01-05');
    expect('2026-11-05' < todayLocalDateInput(now)).toBe(true);
  });

  it('formats a short date', () => {
    expect(formatExpiryDate(endOfLocalDayIso('2026-11-30'))).toBe('Nov 30, 2026');
    expect(formatExpiryDate(null)).toBe('');
    expect(formatExpiryDate('garbage')).toBe('');
  });
});
