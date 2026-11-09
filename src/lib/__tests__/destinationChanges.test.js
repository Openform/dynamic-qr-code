import { describe, it, expect } from 'vitest';
import { parseScheduledChange, MAX_SCHEDULE_AHEAD_DAYS } from '../destinationChanges';

const NOW = Date.parse('2026-11-09T12:00:00Z');

describe('parseScheduledChange', () => {
  it('accepts a URL and a future time, stored as UTC', () => {
    expect(
      parseScheduledChange({ destinationUrl: 'https://example.com/sale', startsAt: '2026-12-01T07:00:00.000Z' }, NOW)
    ).toEqual({ destinationUrl: 'https://example.com/sale', startsAt: '2026-12-01 07:00:00' });
  });

  it('converts a time with an offset to UTC', () => {
    // 09:00 in Johannesburg is 07:00 UTC.
    expect(
      parseScheduledChange({ destinationUrl: 'https://example.com', startsAt: '2026-12-01T09:00+02:00' }, NOW).startsAt
    ).toBe('2026-12-01 07:00:00');
  });

  it('adds https:// when it was left out, and trims spaces', () => {
    expect(
      parseScheduledChange({ destinationUrl: '  example.com/sale ', startsAt: '2026-12-01T07:00:00Z' }, NOW)
        .destinationUrl
    ).toBe('https://example.com/sale');
  });

  it('rejects a missing, insecure or overlong URL', () => {
    const startsAt = '2026-12-01T07:00:00Z';
    expect(parseScheduledChange({ startsAt }, NOW)).toEqual({ error: 'Enter the new destination URL.' });
    expect(parseScheduledChange({ destinationUrl: '   ', startsAt }, NOW)).toHaveProperty('error');
    expect(parseScheduledChange({ destinationUrl: 'http://example.com', startsAt }, NOW)).toEqual({
      error: 'Invalid destination URL. Must be a valid https URL.',
    });
    const long = `https://example.com/${'a'.repeat(2048)}`;
    expect(parseScheduledChange({ destinationUrl: long, startsAt }, NOW).error).toMatch(/at most 2048/);
  });

  it('rejects a missing time, or one without a time zone', () => {
    const destinationUrl = 'https://example.com';
    const error = { error: 'Choose when the change should happen.' };
    expect(parseScheduledChange({ destinationUrl }, NOW)).toEqual(error);
    expect(parseScheduledChange({ destinationUrl, startsAt: 'tomorrow' }, NOW)).toEqual(error);
    // No offset: it could mean any time zone.
    expect(parseScheduledChange({ destinationUrl, startsAt: '2026-12-01T09:00' }, NOW)).toEqual(error);
    expect(parseScheduledChange({ destinationUrl, startsAt: 1796108400000 }, NOW)).toEqual(error);
  });

  it('rejects a time that is not in the future', () => {
    const destinationUrl = 'https://example.com';
    const error = { error: 'Choose a time in the future.' };
    expect(parseScheduledChange({ destinationUrl, startsAt: '2026-11-09T12:00:00Z' }, NOW)).toEqual(error);
    expect(parseScheduledChange({ destinationUrl, startsAt: '2026-11-01T12:00:00Z' }, NOW)).toEqual(error);
    expect(parseScheduledChange({ destinationUrl, startsAt: '2026-11-09T12:00:01Z' }, NOW)).not.toHaveProperty('error');
  });

  it('rejects a time more than 5 years ahead', () => {
    const destinationUrl = 'https://example.com';
    const limit = new Date(NOW + MAX_SCHEDULE_AHEAD_DAYS * 24 * 60 * 60 * 1000);
    expect(parseScheduledChange({ destinationUrl, startsAt: limit.toISOString() }, NOW)).not.toHaveProperty('error');
    const past = new Date(limit.getTime() + 60_000);
    expect(parseScheduledChange({ destinationUrl, startsAt: past.toISOString() }, NOW)).toEqual({
      error: 'Choose a time within the next 5 years.',
    });
  });
});
