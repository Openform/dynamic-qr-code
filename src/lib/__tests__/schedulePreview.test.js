import { describe, it, expect } from 'vitest';
import { weekPreview } from '../schedulePreview';
import { resolveDestination } from '../schedules';

const MAIN = 'https://example.com/menu';
const MINUTE = 60_000;
const at = (iso) => Date.parse(iso);

// Monday to Friday, 07:00–11:00, and a Friday night past midnight.
const breakfast = {
  id: 1,
  kind: 'weekly',
  enabled: true,
  position: 0,
  destinationUrl: 'https://example.com/breakfast',
  timeZone: 'Africa/Johannesburg',
  days: 31,
  startTime: '07:00',
  endTime: '11:00',
};
const lateFriday = { ...breakfast, id: 2, position: 1, destinationUrl: 'https://example.com/late', days: 16, startTime: '22:00', endTime: '02:00' };
const sale = {
  id: 3,
  kind: 'range',
  enabled: true,
  position: 2,
  destinationUrl: 'https://example.com/sale',
  timeZone: 'Africa/Johannesburg',
  startsAt: '2026-11-11T08:00:00.000Z',
  endsAt: '2026-11-12T08:00:00.000Z',
};

/** The local date and minute of `ms` in `timeZone`, worked out separately from the code under test. */
function local(ms, timeZone) {
  const s = new Date(ms).toLocaleString('sv-SE', { timeZone, hourCycle: 'h23' }); // "2026-11-09 07:00:00"
  return { date: s.slice(0, 10), minute: Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16)) };
}

function segmentAt(preview, date, minute) {
  const day = preview.days.find((d) => d.date === date);
  return day?.segments.find((s) => s.start <= minute && minute < s.end);
}

describe('weekPreview', () => {
  const now = at('2026-11-09T08:00:00Z'); // Monday 10:00 in Johannesburg

  it('covers the next seven days, today first, whole days', () => {
    const preview = weekPreview({ mainUrl: MAIN, schedules: [breakfast], now, timeZone: 'Africa/Johannesburg' });
    expect(preview.days.map((d) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(preview.nowMinute).toBe(10 * 60);
    for (const day of preview.days) {
      expect(day.minutes).toBe(1440);
      expect(day.segments[0].start).toBe(0);
      expect(day.segments.at(-1).end).toBe(1440);
    }
    expect(preview.days[0].segments).toEqual([
      { start: 0, end: 420, scheduleId: null, url: MAIN },
      { start: 420, end: 660, scheduleId: 1, url: breakfast.destinationUrl },
      { start: 660, end: 1440, scheduleId: null, url: MAIN },
    ]);
  });

  it('matches the redirect at every minute of the week', () => {
    const schedules = [breakfast, lateFriday, sale];
    for (const timeZone of ['Africa/Johannesburg', 'America/New_York', 'Asia/Kathmandu']) {
      const preview = weekPreview({ mainUrl: MAIN, schedules, now, timeZone });
      const start = at(`${preview.days[0].date}T00:00:00Z`) - 15 * 3600_000;
      let checked = 0;
      for (let t = start; t < start + 8 * 24 * 3600_000; t += MINUTE) {
        const { date, minute } = local(t, timeZone);
        const segment = segmentAt(preview, date, minute);
        if (!preview.days.some((d) => d.date === date)) continue;
        const expected = resolveDestination({ mainUrl: MAIN, schedules, now: t });
        expect({ url: segment?.url, scheduleId: segment?.scheduleId }, `${timeZone} ${date} ${minute}`).toEqual(expected);
        checked++;
      }
      expect(checked).toBe(7 * 1440);
    }
  });

  it('shows date ranges winning over weekly schedules', () => {
    const preview = weekPreview({ mainUrl: MAIN, schedules: [breakfast, sale], now, timeZone: 'Africa/Johannesburg' });
    // Wednesday: the sale runs from 10:00, so breakfast shows only 07:00–10:00.
    expect(segmentAt(preview, '2026-11-11', 9 * 60).scheduleId).toBe(1);
    expect(segmentAt(preview, '2026-11-11', 10 * 60).scheduleId).toBe(3);
    expect(segmentAt(preview, '2026-11-12', 8 * 60).scheduleId).toBe(3);
    expect(segmentAt(preview, '2026-11-12', 10 * 60).scheduleId).toBe(1);
  });

  it('follows pending changes to the main destination', () => {
    const preview = weekPreview({
      mainUrl: MAIN,
      mainChanges: [{ destinationUrl: 'https://example.com/new-menu', startsAt: '2026-11-10T10:00:00.000Z' }],
      schedules: [breakfast],
      now,
      timeZone: 'Africa/Johannesburg',
    });
    expect(segmentAt(preview, '2026-11-10', 11 * 60).url).toBe(MAIN);
    expect(segmentAt(preview, '2026-11-10', 12 * 60).url).toBe('https://example.com/new-menu');
    expect(segmentAt(preview, '2026-11-11', 7 * 60).url).toBe(breakfast.destinationUrl);
    expect(segmentAt(preview, '2026-11-11', 12 * 60).url).toBe('https://example.com/new-menu');
  });

  it('leaves out schedules that are off', () => {
    const preview = weekPreview({ mainUrl: MAIN, schedules: [{ ...breakfast, enabled: false }], now, timeZone: 'UTC' });
    for (const day of preview.days) expect(day.segments).toEqual([{ start: 0, end: 1440, scheduleId: null, url: MAIN }]);
  });

  describe('across London’s clock changes', () => {
    const london = { ...breakfast, timeZone: 'Europe/London', days: 127, startTime: '01:30', endTime: '02:30' };

    it('has a 23-hour day in March, without the hour the clock skips', () => {
      const preview = weekPreview({
        mainUrl: MAIN,
        schedules: [london],
        now: at('2027-03-25T12:00:00Z'),
        timeZone: 'Europe/London',
      });
      const day = preview.days.find((d) => d.date === '2027-03-28');
      expect(day.minutes).toBe(23 * 60);
      // 01:00–02:00 doesn't happen; the 01:30 start goes live at 02:00.
      expect(day.segments).toEqual([
        { start: 0, end: 60, scheduleId: null, url: MAIN },
        { start: 120, end: 150, scheduleId: 1, url: london.destinationUrl },
        { start: 150, end: 1440, scheduleId: null, url: MAIN },
      ]);
      // The day before is normal.
      expect(preview.days.find((d) => d.date === '2027-03-27').segments[1]).toEqual({
        start: 90,
        end: 150,
        scheduleId: 1,
        url: london.destinationUrl,
      });
    });

    it('has a 25-hour day in October', () => {
      const preview = weekPreview({
        mainUrl: MAIN,
        schedules: [london],
        now: at('2027-10-28T12:00:00Z'),
        timeZone: 'Europe/London',
      });
      const day = preview.days.find((d) => d.date === '2027-10-31');
      expect(day.minutes).toBe(25 * 60);
      expect(day.segments.find((s) => s.scheduleId === 1)).toMatchObject({ start: 90, end: 150 });
    });
  });

  it('is quick enough to redraw as a schedule is edited', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...breakfast, id: i + 1, position: i, startTime: `${String(i).padStart(2, '0')}:00` }));
    const started = performance.now();
    weekPreview({ mainUrl: MAIN, schedules: many, now, timeZone: 'Africa/Johannesburg' });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
