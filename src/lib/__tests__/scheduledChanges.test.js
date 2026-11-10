import { describe, it, expect } from 'vitest';
import { describeLength } from '../../app/dashboard/components/scheduledChanges';

const MIN = 60_000;

describe('describeLength', () => {
  it('says minutes, hours and days in words', () => {
    expect(describeLength(3 * MIN)).toBe('3 minutes');
    expect(describeLength(1 * MIN)).toBe('1 minute');
    expect(describeLength(60 * MIN)).toBe('1 hour');
    expect(describeLength(90 * MIN)).toBe('1 hour and 30 minutes');
    expect(describeLength(24 * 60 * MIN)).toBe('1 day');
    expect(describeLength((2 * 24 * 60 + 4 * 60 + 5) * MIN)).toBe('2 days, 4 hours and 5 minutes');
  });

  it('makes an end a day too late obvious', () => {
    // 09:32 today to 09:35 tomorrow.
    expect(describeLength((24 * 60 + 3) * MIN)).toBe('1 day and 3 minutes');
  });

  it('rounds to the minute and never goes below zero', () => {
    expect(describeLength(89_000)).toBe('1 minute');
    expect(describeLength(0)).toBe('0 minutes');
    expect(describeLength(-5 * MIN)).toBe('0 minutes');
  });
});
