import { describe, it, expect } from 'vitest';
import { dayHoursText, hoursRows, hoursStatus } from '../openingHours';
import { defaultHoursDays, hoursDay } from '../pageEditing';

// Monday 16 November 2026 is the first day; South Africa is UTC+2 all year.
const at = (dayOffset, time) => Date.parse(`2026-11-${16 + dayOffset}T${time}:00+02:00`);

function block(days = defaultHoursDays(), timeZone = 'Africa/Johannesburg') {
  return { type: 'hours', timeZone, days };
}

/** A week with the same periods every day. */
const everyDay = (...periods) => Array.from({ length: 7 }, () => ({ periods }));

describe('hoursStatus', () => {
  const hours = block(); // Mon – Fri 08:00 – 17:00, Sat 09:00 – 13:00, Sun closed

  it('says when it closes while it’s open', () => {
    expect(hoursStatus(hours, at(0, '12:00'))).toEqual({ open: true, text: 'Open now · closes 17:00' });
    expect(hoursStatus(hours, at(0, '08:00'))).toEqual({ open: true, text: 'Open now · closes 17:00' });
  });

  it('says when it next opens while it’s closed', () => {
    expect(hoursStatus(hours, at(0, '07:30'))).toEqual({ open: false, text: 'Closed · opens 08:00' });
    expect(hoursStatus(hours, at(0, '17:00'))).toEqual({ open: false, text: 'Closed · opens tomorrow 08:00' });
    expect(hoursStatus(hours, at(4, '18:00'))).toEqual({ open: false, text: 'Closed · opens tomorrow 09:00' });
    expect(hoursStatus(hours, at(5, '14:00'))).toEqual({ open: false, text: 'Closed · opens Mon 08:00' });
    expect(hoursStatus(hours, at(6, '23:00'))).toEqual({ open: false, text: 'Closed · opens tomorrow 08:00' });
  });

  it('reads the clock in the block’s time zone, not the server’s', () => {
    // 12:00 in Johannesburg is 10:00 UTC, and 11:00 in London.
    const london = block(defaultHoursDays(), 'Europe/London');
    expect(hoursStatus(london, at(0, '09:30'))).toEqual({ open: false, text: 'Closed · opens 08:00' });
    expect(hoursStatus(london, at(0, '10:30'))).toEqual({ open: true, text: 'Open now · closes 17:00' });
  });

  it('follows times past midnight, including from Sunday into Monday', () => {
    const days = defaultHoursDays();
    days[4] = hoursDay('18:00', '02:00');
    days[6] = hoursDay('20:00', '02:00');
    expect(hoursStatus(block(days), at(4, '23:00'))).toEqual({ open: true, text: 'Open now · closes 02:00' });
    expect(hoursStatus(block(days), at(5, '01:00'))).toEqual({ open: true, text: 'Open now · closes 02:00' });
    expect(hoursStatus(block(days), at(7, '01:30'))).toEqual({ open: true, text: 'Open now · closes 02:00' });
    expect(hoursStatus(block(days), at(7, '02:00'))).toEqual({ open: false, text: 'Closed · opens 08:00' });
  });

  it('handles a break in the day, and times that run into each other', () => {
    const split = block(everyDay({ open: '12:00', close: '15:00' }, { open: '18:00', close: '22:00' }));
    expect(hoursStatus(split, at(0, '13:00'))).toEqual({ open: true, text: 'Open now · closes 15:00' });
    expect(hoursStatus(split, at(0, '16:00'))).toEqual({ open: false, text: 'Closed · opens 18:00' });
    const joined = block(everyDay({ open: '08:00', close: '17:00' }, { open: '17:00', close: '22:00' }));
    expect(hoursStatus(joined, at(0, '12:00'))).toEqual({ open: true, text: 'Open now · closes 22:00' });
  });

  it('says “Open 24 hours” when it never closes, and when it closes after a day of being open', () => {
    expect(hoursStatus(block(everyDay({ open: '00:00', close: '00:00' })), at(2, '03:00'))).toEqual({ open: true, text: 'Open 24 hours' });
    // Monday 09:00 for a whole day runs into Tuesday's 08:00 – 17:00.
    const days = defaultHoursDays();
    days[0] = hoursDay('09:00', '09:00');
    expect(hoursStatus(block(days), at(0, '10:00'))).toEqual({ open: true, text: 'Open now · closes tomorrow 17:00' });
    days[1] = hoursDay();
    expect(hoursStatus(block(days), at(0, '10:00'))).toEqual({ open: true, text: 'Open now · closes tomorrow 09:00' });
  });

  it('gives nothing when there are no hours, or the time zone can’t be read', () => {
    expect(hoursStatus(block(everyDay()), at(0, '12:00'))).toBeNull();
    expect(hoursStatus(block(defaultHoursDays(), 'Mars/Olympus'), at(0, '12:00'))).toBeNull();
  });
});

describe('hoursRows', () => {
  it('runs days with the same hours together and marks today', () => {
    expect(hoursRows(block(), at(2, '12:00'))).toEqual([
      { days: 'Mon – Fri', hours: '08:00 – 17:00', today: true },
      { days: 'Sat', hours: '09:00 – 13:00', today: false },
      { days: 'Sun', hours: 'Closed', today: false },
    ]);
    expect(hoursRows(block(), at(6, '12:00')).map((row) => row.today)).toEqual([false, false, true]);
  });

  it('says “Every day” when every day is the same', () => {
    expect(hoursRows(block(everyDay({ open: '00:00', close: '00:00' })), at(0, '12:00'))).toEqual([{ days: 'Every day', hours: 'Open 24 hours', today: true }]);
  });

  it('lists a day’s times together', () => {
    const days = defaultHoursDays();
    days[5] = { periods: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '15:00' }] };
    expect(dayHoursText(block(days), 5)).toBe('09:00 – 12:00, 13:00 – 15:00');
    expect(dayHoursText(block(days), 6)).toBe('Closed');
  });
});
