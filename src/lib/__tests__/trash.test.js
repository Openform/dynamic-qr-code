import { describe, it, expect } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  MAX_TRASH_IDS,
  validateIdList,
  describeAge,
  describeDaysLeft,
} from '../trash';

describe('constants', () => {
  it('keeps the agreed bounds', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(MAX_TRASH_IDS).toBe(500);
  });
});

describe('validateIdList', () => {
  it('accepts positive whole numbers and removes duplicates', () => {
    expect(validateIdList([3, 1, 3, 2])).toEqual({ ids: [3, 1, 2] });
  });

  it('rejects a missing, empty or non-array list', () => {
    for (const bad of [undefined, null, [], 'x', {}, 5]) {
      expect(validateIdList(bad)).toHaveProperty('error');
    }
  });

  it('rejects ids that are not positive whole numbers', () => {
    for (const bad of [[0], [-1], [1.5], ['1'], [null], [NaN], [Infinity], [1, 'two']]) {
      expect(validateIdList(bad)).toEqual({ error: 'ids must be positive whole numbers.' });
    }
  });

  it('enforces the limit exactly', () => {
    const atLimit = Array.from({ length: MAX_TRASH_IDS }, (_, i) => i + 1);
    expect(validateIdList(atLimit).ids).toHaveLength(MAX_TRASH_IDS);
    const over = validateIdList([...atLimit, MAX_TRASH_IDS + 1]);
    expect(over.error).toMatch(/at most 500/);
  });

  it('counts the limit before removing duplicates, so a huge list is refused cheaply', () => {
    const dupes = Array.from({ length: MAX_TRASH_IDS + 1 }, () => 7);
    expect(validateIdList(dupes)).toHaveProperty('error');
  });

  it('honours a custom limit', () => {
    expect(validateIdList([1, 2, 3], 2)).toHaveProperty('error');
    expect(validateIdList([1, 2], 2)).toEqual({ ids: [1, 2] });
  });
});

describe('describeAge', () => {
  it('reads naturally across units', () => {
    expect(describeAge(0)).toBe('just now');
    expect(describeAge(1)).toBe('1 minute ago');
    expect(describeAge(59)).toBe('59 minutes ago');
    expect(describeAge(60)).toBe('1 hour ago');
    expect(describeAge(23 * 60 + 59)).toBe('23 hours ago');
    expect(describeAge(24 * 60)).toBe('1 day ago');
    expect(describeAge(3 * 24 * 60 + 5)).toBe('3 days ago');
  });

  it('tolerates junk and negatives', () => {
    expect(describeAge(-5)).toBe('just now');
    expect(describeAge(undefined)).toBe('just now');
    expect(describeAge('abc')).toBe('just now');
  });
});

describe('describeDaysLeft', () => {
  it('says "today" when under a day is left', () => {
    expect(describeDaysLeft(0)).toBe('today');
    expect(describeDaysLeft(-3)).toBe('today');
  });

  it('pluralises', () => {
    expect(describeDaysLeft(1)).toBe('in 1 day');
    expect(describeDaysLeft(27)).toBe('in 27 days');
  });
});
