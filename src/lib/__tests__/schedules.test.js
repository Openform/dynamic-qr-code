import { describe, it, expect } from 'vitest';
import {
  resolveDestination,
  isScheduleLive,
  scheduleStatus,
  findOverlaps,
  describeSchedules,
  scheduleSummary,
} from '../schedules';

const MAIN = 'https://example.com/menu';
const at = (iso) => Date.parse(iso);

// Days, a bit each: Monday = 1 … Sunday = 64.
const MON_TO_FRI = 1 | 2 | 4 | 8 | 16;
const FRI = 16;
const SUN = 64;

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

  it('ignores ranges that are off or ended, and weekly schedules', () => {
    const a = range({ id: 1 });
    const off = range({ id: 2, enabled: 0 });
    const ended = range({ id: 3, startsAt: '2026-11-01 00:00:00', endsAt: '2026-11-02 00:00:00' });
    const later = at('2026-11-29T00:00:00Z');
    const endedByThen = range({ id: 4, startsAt: '2026-11-27 00:00:00', endsAt: '2026-11-28 00:00:00' });
    expect(findOverlaps([a, off, ended, weekly({ id: 5 })], now).size).toBe(0);
    expect(findOverlaps([a, endedByThen], later).size).toBe(0);
  });
});

describe('describeSchedules', () => {
  it('adds each status and overlap, and names the schedule that wins now', () => {
    const now = at('2026-11-29T12:00:00Z');
    const first = range({ id: 1, position: 0, startsAt: '2026-11-29 00:00:00', endsAt: '2026-11-30 00:00:00' });
    const second = range({ id: 2, position: 1 });
    const { schedules, liveScheduleId } = describeSchedules([first, second], now);
    expect(liveScheduleId).toBe(1);
    expect(schedules.map((s) => [s.id, s.status, s.overlapsWith])).toEqual([
      [1, 'live', [2]],
      [2, 'live', [1]],
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
        endsAt: '2026-11-30 22:00:00',
      },
      scheduleCount: 2,
    });
  });

  it('is empty without schedules', () => {
    expect(scheduleSummary()).toEqual({ liveSchedule: null, scheduleCount: 0 });
  });
});
