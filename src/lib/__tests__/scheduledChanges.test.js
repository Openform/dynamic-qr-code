import { describe, it, expect } from 'vitest';
import {
  describeLength,
  describeDays,
  describeDailyTimes,
  describeWeekly,
} from '../../app/dashboard/components/scheduledChanges';

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

describe('describeDays', () => {
  it('names days, and spans of three or more', () => {
    expect(describeDays(127)).toBe('every day');
    expect(describeDays(31)).toBe('Mon–Fri');
    expect(describeDays(32 | 64)).toBe('Sat and Sun');
    expect(describeDays(1 | 4 | 16)).toBe('Mon, Wed and Fri');
    expect(describeDays(1 | 2 | 4 | 16)).toBe('Mon–Wed and Fri');
    expect(describeDays(16 | 32 | 64)).toBe('Fri–Sun');
    expect(describeDays(1 | 64)).toBe('Mon and Sun');
    expect(describeDays(8)).toBe('Thu');
  });
});

describe('describeDailyTimes and describeWeekly', () => {
  it('says when a window runs past midnight or all day', () => {
    expect(describeDailyTimes('07:00', '11:00')).toBe('07:00–11:00');
    expect(describeDailyTimes('22:00', '02:00')).toBe('22:00–02:00 the next day');
    expect(describeDailyTimes('00:00', '00:00')).toBe('all day');
    expect(describeDailyTimes('09:00', '09:00')).toBe('24 hours from 09:00');
  });

  it('puts days and times together', () => {
    expect(describeWeekly({ days: 31, startTime: '07:00', endTime: '11:00' })).toBe('Mon–Fri, 07:00–11:00');
    expect(describeWeekly({ days: 127, startTime: '00:00', endTime: '00:00' })).toBe('Every day, all day');
  });
});
