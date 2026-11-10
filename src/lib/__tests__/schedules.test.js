import { describe, it, expect } from 'vitest';
import {
  resolveDestination,
  isScheduleLive,
  scheduleStatus,
  findOverlaps,
  describeSchedules,
  scheduleSummary,
  nextChange,
} from '../schedules';

const MAIN = 'https://example.com/menu';
const at = (iso) => Date.parse(iso);

// Days, a bit each: Monday = 1 … Sunday = 64.
const MON_TO_FRI = 1 | 2 | 4 | 8 | 16;
const FRI = 16;
const SAT = 32;
const SUN = 64;
const EVERY_DAY = 127;

const range = (fields = {}) => ({
  id: 1,
  kind: 'range',
  enabled: 1,
  position: 0,
  destinationUrl: 'https://example.com/black-friday',
  startsAt: '2026-11-27 22:00:00',
  endsAt: '2026-11-30 22:00:00',
  ...fields,
});

// Monday to Friday, 07:00–11:00 in Johannesburg (UTC+2 all year).
const weekly = (fields = {}) => ({
  id: 2,
  kind: 'weekly',
  enabled: 1,
  position: 0,
  destinationUrl: 'https://example.com/breakfast',
  timeZone: 'Africa/Johannesburg',
  days: MON_TO_FRI,
  startTime: '07:00',
  endTime: '11:00',
  ...fields,
});

describe('resolveDestination', () => {
  it('goes to the main destination when there are no schedules', () => {
    expect(resolveDestination({ mainUrl: MAIN })).toEqual({ url: MAIN, scheduleId: null });
    expect(resolveDestination({ mainUrl: MAIN, schedules: [] })).toEqual({ url: MAIN, scheduleId: null });
  });

  it('goes to the main destination when no schedule is live', () => {
    const now = at('2026-11-09T12:00:00Z'); // Monday 14:00 in Johannesburg
    expect(resolveDestination({ mainUrl: MAIN, schedules: [range(), weekly()], now })).toEqual({
      url: MAIN,
      scheduleId: null,
    });
  });

  it('goes to a live schedule and names it', () => {
    const now = at('2026-11-09T06:00:00Z'); // Monday 08:00 in Johannesburg
    expect(resolveDestination({ mainUrl: MAIN, schedules: [weekly({ id: 7 })], now })).toEqual({
      url: 'https://example.com/breakfast',
      scheduleId: 7,
    });
  });

  it('ignores schedules that are switched off or have no URL', () => {
    const now = at('2026-11-09T06:00:00Z');
    for (const schedule of [weekly({ enabled: 0 }), weekly({ enabled: false }), weekly({ destinationUrl: '' })]) {
      expect(resolveDestination({ mainUrl: MAIN, schedules: [schedule], now }).url).toBe(MAIN);
    }
  });

  it('prefers a date range over a weekly schedule', () => {
    // Monday 30 Nov 2026, 08:00 in Johannesburg: both are live.
    const now = at('2026-11-30T06:00:00Z');
    const schedules = [weekly({ id: 1, position: 0 }), range({ id: 2, position: 5 })];
    expect(resolveDestination({ mainUrl: MAIN, schedules, now }).scheduleId).toBe(2);
  });

  it('then prefers the lowest position, then the lowest id', () => {
    const now = at('2026-11-09T06:00:00Z');
    const byPosition = [weekly({ id: 1, position: 2 }), weekly({ id: 2, position: 1 })];
    expect(resolveDestination({ mainUrl: MAIN, schedules: byPosition, now }).scheduleId).toBe(2);
    const byId = [weekly({ id: 9, position: 0 }), weekly({ id: 3, position: 0 })];
    expect(resolveDestination({ mainUrl: MAIN, schedules: byId, now }).scheduleId).toBe(3);
  });

  it('uses the current time by default', () => {
    const always = range({ startsAt: '2000-01-01 00:00:00', endsAt: '2999-01-01 00:00:00' });
    expect(resolveDestination({ mainUrl: MAIN, schedules: [always] }).scheduleId).toBe(1);
  });
});

describe('date-range schedules', () => {
  it('include the start and exclude the end', () => {
    expect(isScheduleLive(range(), at('2026-11-27T21:59:59Z'))).toBe(false);
    expect(isScheduleLive(range(), at('2026-11-27T22:00:00Z'))).toBe(true);
    expect(isScheduleLive(range(), at('2026-11-30T21:59:59Z'))).toBe(true);
    expect(isScheduleLive(range(), at('2026-11-30T22:00:00Z'))).toBe(false);
  });

  it('accept Dates, ms and ISO strings as well as database times', () => {
    const schedule = range({ startsAt: new Date('2026-11-27T22:00:00Z'), endsAt: '2026-11-30T22:00:00Z' });
    expect(isScheduleLive(schedule, new Date('2026-11-28T00:00:00Z'))).toBe(true);
    expect(isScheduleLive(range({ startsAt: at('2026-11-27T22:00:00Z') }), at('2026-11-28T00:00:00Z'))).toBe(true);
  });

  it('are never live with a missing or invalid time', () => {
    const now = at('2026-11-28T00:00:00Z');
    expect(isScheduleLive(range({ endsAt: null }), now)).toBe(false);
    expect(isScheduleLive(range({ startsAt: undefined }), now)).toBe(false);
    expect(isScheduleLive(range({ startsAt: 'soon' }), now)).toBe(false);
  });
});

describe('weekly schedules', () => {
  it('are live on the chosen days between the two times, in their time zone', () => {
    expect(isScheduleLive(weekly(), at('2026-11-09T04:59:00Z'))).toBe(false); // Mon 06:59
    expect(isScheduleLive(weekly(), at('2026-11-09T05:00:00Z'))).toBe(true); // Mon 07:00
    expect(isScheduleLive(weekly(), at('2026-11-09T08:59:00Z'))).toBe(true); // Mon 10:59
    expect(isScheduleLive(weekly(), at('2026-11-09T09:00:00Z'))).toBe(false); // Mon 11:00
    expect(isScheduleLive(weekly(), at('2026-11-14T06:00:00Z'))).toBe(false); // Sat 08:00
  });

  it('accept times as the database returns them', () => {
    const schedule = weekly({ startTime: '07:00:00', endTime: '11:00:00' });
    expect(isScheduleLive(schedule, at('2026-11-09T05:00:00Z'))).toBe(true);
  });

  it('run past midnight into the next day', () => {
    const lateFriday = weekly({ days: FRI, startTime: '22:00', endTime: '02:00' });
    expect(isScheduleLive(lateFriday, at('2026-11-13T19:59:00Z'))).toBe(false); // Fri 21:59
    expect(isScheduleLive(lateFriday, at('2026-11-13T20:00:00Z'))).toBe(true); // Fri 22:00
    expect(isScheduleLive(lateFriday, at('2026-11-13T23:30:00Z'))).toBe(true); // Sat 01:30
    expect(isScheduleLive(lateFriday, at('2026-11-14T00:00:00Z'))).toBe(false); // Sat 02:00
    // Saturday night and the early hours of Friday aren't chosen.
    expect(isScheduleLive(lateFriday, at('2026-11-14T20:00:00Z'))).toBe(false); // Sat 22:00
    expect(isScheduleLive(lateFriday, at('2026-11-12T23:00:00Z'))).toBe(false); // Fri 01:00
  });

  it('cover 24 hours when the start and end are the same', () => {
    const allSunday = weekly({ days: SUN, startTime: '00:00', endTime: '00:00' });
    expect(isScheduleLive(allSunday, at('2026-11-14T21:59:00Z'))).toBe(false); // Sat 23:59
    expect(isScheduleLive(allSunday, at('2026-11-14T22:00:00Z'))).toBe(true); // Sun 00:00
    expect(isScheduleLive(allSunday, at('2026-11-15T21:59:00Z'))).toBe(true); // Sun 23:59
    expect(isScheduleLive(allSunday, at('2026-11-15T22:00:00Z'))).toBe(false); // Mon 00:00
  });

  it('go live when the local clock first shows a time inside them as clocks go forward', () => {
    // Berlin, Sunday 28 March 2027: 02:00 jumps straight to 03:00.
    const early = weekly({ timeZone: 'Europe/Berlin', days: SUN, startTime: '02:30', endTime: '04:00' });
    expect(isScheduleLive(early, at('2027-03-28T00:59:00Z'))).toBe(false); // 01:59 CET
    expect(isScheduleLive(early, at('2027-03-28T01:00:00Z'))).toBe(true); // 03:00 CEST
    expect(isScheduleLive(early, at('2027-03-28T02:00:00Z'))).toBe(false); // 04:00 CEST
  });

  it('are live both times an hour happens as clocks go back', () => {
    // Berlin, Sunday 31 October 2027: 03:00 goes back to 02:00.
    const night = weekly({ timeZone: 'Europe/Berlin', days: SUN, startTime: '02:00', endTime: '03:00' });
    expect(isScheduleLive(night, at('2027-10-31T00:30:00Z'))).toBe(true); // 02:30 CEST
    expect(isScheduleLive(night, at('2027-10-31T01:30:00Z'))).toBe(true); // 02:30 CET
    expect(isScheduleLive(night, at('2027-10-31T02:00:00Z'))).toBe(false); // 03:00 CET
  });

  // London, 2027: clocks go forward on Sunday 28 March at 01:00 GMT (to 02:00
  // BST) and back on Sunday 31 October at 02:00 BST (to 01:00 GMT). Both
  // changes happen at 01:00 UTC.
  describe('across London’s clock changes', () => {
    const london = (fields) => weekly({ timeZone: 'Europe/London', ...fields });

    it('keep to the local clock on both sides of the change', () => {
      const breakfast = london({ days: EVERY_DAY });
      // March: 07:00 is 07:00 UTC on Saturday and 06:00 UTC on Sunday.
      expect(isScheduleLive(breakfast, at('2027-03-27T06:59:00Z'))).toBe(false);
      expect(isScheduleLive(breakfast, at('2027-03-27T07:00:00Z'))).toBe(true);
      expect(isScheduleLive(breakfast, at('2027-03-28T05:59:00Z'))).toBe(false);
      expect(isScheduleLive(breakfast, at('2027-03-28T06:00:00Z'))).toBe(true);
      expect(isScheduleLive(breakfast, at('2027-03-28T10:00:00Z'))).toBe(false); // 11:00 BST
      // October: the other way round.
      expect(isScheduleLive(breakfast, at('2027-10-30T06:00:00Z'))).toBe(true); // Sat 07:00 BST
      expect(isScheduleLive(breakfast, at('2027-10-31T06:00:00Z'))).toBe(false); // Sun 06:00 GMT
      expect(isScheduleLive(breakfast, at('2027-10-31T07:00:00Z'))).toBe(true); // Sun 07:00 GMT
      expect(isScheduleLive(breakfast, at('2027-10-31T11:00:00Z'))).toBe(false); // Sun 11:00 GMT
    });

    it('go live when the clock jumps past their start, in March', () => {
      // 01:00–02:00 doesn't happen, so a 01:30 start goes live at 02:00 BST.
      const night = london({ days: SUN, startTime: '01:30', endTime: '02:30' });
      expect(isScheduleLive(night, at('2027-03-28T00:59:00Z'))).toBe(false); // 00:59 GMT
      expect(isScheduleLive(night, at('2027-03-28T01:00:00Z'))).toBe(true); // 02:00 BST
      expect(isScheduleLive(night, at('2027-03-28T01:29:00Z'))).toBe(true); // 02:29 BST
      expect(isScheduleLive(night, at('2027-03-28T01:30:00Z'))).toBe(false); // 02:30 BST
    });

    it('are live both times an hour happens, in October', () => {
      const night = london({ days: SUN, startTime: '01:15', endTime: '01:45' });
      expect(isScheduleLive(night, at('2027-10-31T00:15:00Z'))).toBe(true); // 01:15 BST
      expect(isScheduleLive(night, at('2027-10-31T00:45:00Z'))).toBe(false); // 01:45 BST
      expect(isScheduleLive(night, at('2027-10-31T01:00:00Z'))).toBe(false); // 01:00 GMT
      expect(isScheduleLive(night, at('2027-10-31T01:15:00Z'))).toBe(true); // 01:15 GMT
      expect(isScheduleLive(night, at('2027-10-31T01:45:00Z'))).toBe(false); // 01:45 GMT
    });
  });

  it('are never live with bad fields, and never throw', () => {
    const now = at('2026-11-09T06:00:00Z');
    for (const fields of [
      { timeZone: 'Not/AZone' },
      { timeZone: '' },
      { timeZone: undefined },
      { days: 0 },
      { days: 'weekdays' },
      { startTime: '25:00' },
      { endTime: '7am' },
      { kind: 'monthly' },
    ]) {
      expect(isScheduleLive(weekly(fields), now)).toBe(false);
    }
    expect(resolveDestination({ mainUrl: MAIN, schedules: [weekly({ timeZone: 'Not/AZone' })], now }).url).toBe(MAIN);
  });
});

describe('scheduleStatus', () => {
  const now = at('2026-11-28T12:00:00Z');
  it('tells live, upcoming, off and ended apart', () => {
    expect(scheduleStatus(range(), now)).toBe('live');
    expect(scheduleStatus(range({ startsAt: '2026-12-24 00:00:00', endsAt: '2026-12-27 00:00:00' }), now)).toBe('upcoming');
    expect(scheduleStatus(range({ enabled: 0 }), now)).toBe('off');
    expect(scheduleStatus(range({ endsAt: '2026-11-28 12:00:00' }), now)).toBe('ended');
    // Ended wins over off: it's listed with the ended ones either way.
    expect(scheduleStatus(range({ enabled: 0, endsAt: '2026-11-01 00:00:00' }), now)).toBe('ended');
  });

  it('never calls a weekly schedule ended', () => {
    expect(scheduleStatus(weekly(), at('2026-11-30T06:00:00Z'))).toBe('live'); // Mon 08:00
    expect(scheduleStatus(weekly(), at('2026-11-30T12:00:00Z'))).toBe('upcoming');
  });
});

describe('findOverlaps', () => {
  const now = at('2026-11-20T00:00:00Z');

  it('pairs date ranges whose times overlap, both ways', () => {
    const a = range({ id: 1, startsAt: '2026-11-27 22:00:00', endsAt: '2026-11-30 22:00:00' });
    const b = range({ id: 2, startsAt: '2026-11-30 00:00:00', endsAt: '2026-12-02 00:00:00' });
    const c = range({ id: 3, startsAt: '2026-12-24 00:00:00', endsAt: '2026-12-27 00:00:00' });
    const overlaps = findOverlaps([a, b, c], now);
    expect(overlaps.get(1)).toEqual([2]);
    expect(overlaps.get(2)).toEqual([1]);
    expect(overlaps.has(3)).toBe(false);
  });

  it('treats ranges that only touch as not overlapping', () => {
    const a = range({ id: 1, startsAt: '2026-11-27 00:00:00', endsAt: '2026-11-28 00:00:00' });
    const b = range({ id: 2, startsAt: '2026-11-28 00:00:00', endsAt: '2026-11-29 00:00:00' });
    expect(findOverlaps([a, b], now).size).toBe(0);
  });

  it('ignores ranges that are off or ended, and doesn’t compare ranges with weekly schedules', () => {
    const a = range({ id: 1 });
    const off = range({ id: 2, enabled: 0 });
    const ended = range({ id: 3, startsAt: '2026-11-01 00:00:00', endsAt: '2026-11-02 00:00:00' });
    const later = at('2026-11-29T00:00:00Z');
    const endedByThen = range({ id: 4, startsAt: '2026-11-27 00:00:00', endsAt: '2026-11-28 00:00:00' });
    expect(findOverlaps([a, off, ended, weekly({ id: 5 })], now).size).toBe(0);
    expect(findOverlaps([a, endedByThen], later).size).toBe(0);
  });
});

describe('findOverlaps: weekly schedules', () => {
  const now = at('2026-11-10T12:00:00Z');

  it('finds weekly schedules that share a time on a day', () => {
    const breakfast = weekly({ id: 1 }); // Mon–Fri 07:00–11:00
    const brunch = weekly({ id: 2, days: 1 | SAT, startTime: '10:00', endTime: '12:00' });
    const weekend = weekly({ id: 3, days: SAT | SUN, startTime: '07:00', endTime: '11:00' });
    const overlaps = findOverlaps([breakfast, brunch, weekend], now);
    expect(overlaps.get(1)).toEqual([2]);
    expect(overlaps.get(2)).toEqual([1, 3]);
    expect(overlaps.get(3)).toEqual([2]);
  });

  it('counts the early hours of a window past midnight as the next day', () => {
    const late = weekly({ id: 1, days: FRI, startTime: '22:00', endTime: '02:00' });
    const saturdayEarly = weekly({ id: 2, days: SAT, startTime: '01:00', endTime: '03:00' });
    const fridayEarly = weekly({ id: 3, days: FRI, startTime: '01:00', endTime: '03:00' });
    const overlaps = findOverlaps([late, saturdayEarly, fridayEarly], now);
    expect(overlaps.get(1)).toEqual([2]);
    expect(overlaps.has(3)).toBe(false);
  });

  it('compares schedules in different time zones on the same clock', () => {
    // Johannesburg 07:00–11:00 is 05:00–09:00 UTC; London is on UTC in November.
    const joburg = weekly({ id: 1 });
    const londonOverlapping = weekly({ id: 2, timeZone: 'Europe/London', startTime: '08:00', endTime: '09:00' });
    const londonAfter = weekly({ id: 3, timeZone: 'Europe/London', startTime: '09:00', endTime: '10:00' });
    const overlaps = findOverlaps([joburg, londonOverlapping, londonAfter], now);
    expect(overlaps.get(1)).toEqual([2]);
    expect(overlaps.has(3)).toBe(false);
  });

  it('ignores schedules that are off or have bad fields', () => {
    const off = weekly({ id: 2, enabled: false });
    const broken = weekly({ id: 3, timeZone: 'Not/AZone' });
    expect(findOverlaps([weekly({ id: 1 }), off, broken], now).size).toBe(0);
  });
});

describe('nextChange', () => {
  it('gives a date range’s start, then its end', () => {
    const r = range({ startsAt: '2026-11-27T22:00:00Z', endsAt: '2026-11-30T22:00:00Z' });
    expect(nextChange(r, at('2026-11-01T00:00:00Z'))).toBe('2026-11-27T22:00:00.000Z');
    expect(nextChange(r, at('2026-11-28T00:00:00Z'))).toBe('2026-11-30T22:00:00.000Z');
    expect(nextChange(r, at('2026-12-01T00:00:00Z'))).toBeNull();
    expect(nextChange(range({ enabled: 0 }), at('2026-11-01T00:00:00Z'))).toBeNull();
  });

  it('gives when a weekly window ends, or when the next one starts', () => {
    const breakfast = weekly(); // Mon–Fri 07:00–11:00 Johannesburg (UTC+2)
    expect(nextChange(breakfast, at('2026-11-09T06:00:00Z'))).toBe('2026-11-09T09:00:00.000Z'); // Mon 08:00 → 11:00
    expect(nextChange(breakfast, at('2026-11-09T10:00:00Z'))).toBe('2026-11-10T05:00:00.000Z'); // Mon 12:00 → Tue 07:00
    expect(nextChange(breakfast, at('2026-11-13T10:00:00Z'))).toBe('2026-11-16T05:00:00.000Z'); // Fri 12:00 → Mon 07:00
    expect(nextChange(breakfast, at('2026-11-09T05:00:30Z'))).toBe('2026-11-09T09:00:00.000Z'); // mid-minute
  });

  it('follows windows past midnight and joins whole days together', () => {
    const late = weekly({ days: FRI, startTime: '22:00', endTime: '02:00' });
    expect(nextChange(late, at('2026-11-13T21:00:00Z'))).toBe('2026-11-14T00:00:00.000Z'); // Fri 23:00 → Sat 02:00
    const weekend = weekly({ days: SAT | SUN, startTime: '00:00', endTime: '00:00' });
    expect(nextChange(weekend, at('2026-11-14T10:00:00Z'))).toBe('2026-11-15T22:00:00.000Z'); // Sat → Mon 00:00
  });

  it('is null for a weekly schedule that’s live all week, or off, or broken', () => {
    expect(nextChange(weekly({ days: EVERY_DAY, startTime: '00:00', endTime: '00:00' }))).toBeNull();
    expect(nextChange(weekly({ enabled: false }))).toBeNull();
    expect(nextChange(weekly({ timeZone: 'Not/AZone' }))).toBeNull();
    expect(nextChange(weekly({ days: 0 }))).toBeNull();
  });

  it('is exact across London’s clock changes', () => {
    const london = (fields) => weekly({ timeZone: 'Europe/London', ...fields });
    // Breakfast every day: Saturday noon GMT → Sunday 07:00 BST.
    expect(nextChange(london({ days: EVERY_DAY }), at('2027-03-27T12:00:00Z'))).toBe('2027-03-28T06:00:00.000Z');
    // The weekend all day: until Monday 00:00 BST in March, 00:00 GMT in October.
    const weekend = london({ days: SAT | SUN, startTime: '00:00', endTime: '00:00' });
    expect(nextChange(weekend, at('2027-03-27T12:00:00Z'))).toBe('2027-03-28T23:00:00.000Z');
    expect(nextChange(weekend, at('2027-10-30T12:00:00Z'))).toBe('2027-11-01T00:00:00.000Z');
    // An end that doesn't exist that night: reached when the clock jumps to 02:00 BST.
    const night = london({ days: SUN, startTime: '00:00', endTime: '01:30' });
    expect(nextChange(night, at('2027-03-28T00:30:00Z'))).toBe('2027-03-28T01:00:00.000Z');
    // The hour that happens twice: live again at 01:15 GMT after stopping at 01:45 BST.
    const twice = london({ days: SUN, startTime: '01:15', endTime: '01:45' });
    expect(nextChange(twice, at('2027-10-31T00:20:00Z'))).toBe('2027-10-31T00:45:00.000Z');
    expect(nextChange(twice, at('2027-10-31T00:50:00Z'))).toBe('2027-10-31T01:15:00.000Z');
  });

  it('agrees with isScheduleLive minute by minute', () => {
    const cases = [
      london => london({ days: 1 | 8 | 64, startTime: '23:30', endTime: '00:30' }),
      london => london({ days: EVERY_DAY, startTime: '00:05', endTime: '00:00' }),
      london => london({ days: SUN, startTime: '01:00', endTime: '02:00' }),
    ];
    const starts = ['2027-03-27T20:00:00Z', '2027-10-30T20:00:00Z', '2026-11-10T08:00:00Z'];
    for (const make of cases) {
      const schedule = make((fields) => weekly({ timeZone: 'Europe/London', ...fields }));
      for (const start of starts) {
        let t = at(start);
        // Follow the changes for two days and check every minute in between.
        while (t < at(start) + 2 * 24 * 3600_000) {
          const next = nextChange(schedule, t);
          expect(next).not.toBeNull();
          const nextMs = Date.parse(next);
          const live = isScheduleLive(schedule, t);
          for (let m = t + 60_000 - (t % 60_000); m < nextMs; m += 60_000) {
            expect(isScheduleLive(schedule, m), new Date(m).toISOString()).toBe(live);
          }
          expect(isScheduleLive(schedule, nextMs)).toBe(!live);
          t = nextMs;
        }
      }
    }
  });
});

describe('describeSchedules', () => {
  it('adds each status and overlap, and names the schedule that wins now', () => {
    const now = at('2026-11-29T12:00:00Z');
    const first = range({ id: 1, position: 0, startsAt: '2026-11-29 00:00:00', endsAt: '2026-11-30 00:00:00' });
    const second = range({ id: 2, position: 1 });
    const { schedules, liveScheduleId } = describeSchedules([first, second], now);
    expect(liveScheduleId).toBe(1);
    expect(schedules.map((s) => [s.id, s.status, s.overlapsWith, s.nextChangeAt])).toEqual([
      [1, 'live', [2], '2026-11-30T00:00:00.000Z'],
      [2, 'live', [1], '2026-11-30T22:00:00.000Z'],
    ]);
  });

  it('has no live schedule when none is live', () => {
    expect(describeSchedules([range()], at('2026-11-01T00:00:00Z')).liveScheduleId).toBeNull();
    expect(describeSchedules([], at('2026-11-01T00:00:00Z'))).toEqual({ schedules: [], liveScheduleId: null });
  });
});

describe('scheduleSummary', () => {
  it('names the live schedule and counts those that haven’t ended', () => {
    const now = at('2026-11-28T12:00:00Z');
    const ended = range({ id: 3, startsAt: '2026-11-01 00:00:00', endsAt: '2026-11-02 00:00:00' });
    const off = range({ id: 4, enabled: 0, startsAt: '2026-12-01 00:00:00', endsAt: '2026-12-02 00:00:00' });
    expect(scheduleSummary([range({ label: 'Black Friday' }), ended, off], now)).toEqual({
      liveSchedule: {
        id: 1,
        label: 'Black Friday',
        destinationUrl: 'https://example.com/black-friday',
        until: '2026-11-30T22:00:00.000Z',
      },
      scheduleCount: 2,
    });
  });

  it('says until when a live weekly schedule runs, or null if it’s live all week', () => {
    const now = at('2026-11-09T06:00:00Z'); // Mon 08:00 in Johannesburg
    expect(scheduleSummary([weekly({ label: 'Breakfast' })], now).liveSchedule).toMatchObject({
      label: 'Breakfast',
      until: '2026-11-09T09:00:00.000Z',
    });
    const always = weekly({ days: EVERY_DAY, startTime: '00:00', endTime: '00:00' });
    expect(scheduleSummary([always], now).liveSchedule.until).toBeNull();
  });

  it('is empty without schedules', () => {
    expect(scheduleSummary()).toEqual({ liveSchedule: null, scheduleCount: 0 });
  });
});
