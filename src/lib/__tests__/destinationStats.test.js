import { describe, it, expect } from 'vitest';
import { mainPeriods, periodIndexAt, mainUrlAt, destinationRows } from '../destinationStats';

const at = (iso) => Date.parse(iso);
const DAY = 24 * 60 * 60 * 1000;

const history = [
  { id: 1, url: 'https://example.com/a', startedAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, url: 'https://example.com/b', startedAt: '2026-03-01T00:00:00.000Z' },
  { id: 3, url: 'https://example.com/a', startedAt: '2026-06-01T00:00:00.000Z' },
];
const code = { url: 'https://example.com/a', createdAt: '2026-01-01T00:00:00.000Z' };

describe('mainPeriods', () => {
  it('makes one period per started history row, each ending when the next starts', () => {
    expect(mainPeriods(history, code)).toEqual([
      { key: 'period-1', id: 1, url: 'https://example.com/a', startedAt: at('2026-01-01T00:00:00Z'), endedAt: at('2026-03-01T00:00:00Z') },
      { key: 'period-2', id: 2, url: 'https://example.com/b', startedAt: at('2026-03-01T00:00:00Z'), endedAt: at('2026-06-01T00:00:00Z') },
      { key: 'period-3', id: 3, url: 'https://example.com/a', startedAt: at('2026-06-01T00:00:00Z'), endedAt: null },
    ]);
  });

  it('gives a code with no history one period since it was created', () => {
    expect(mainPeriods([], code)).toEqual([
      { key: 'main', id: null, url: code.url, startedAt: at(code.createdAt), endedAt: null },
    ]);
  });

  it('calls a lone period the main destination, since it has every main scan', () => {
    expect(mainPeriods(history.slice(0, 1), code)).toEqual([
      { key: 'main', id: 1, url: 'https://example.com/a', startedAt: at('2026-01-01T00:00:00Z'), endedAt: null },
    ]);
  });
});

describe('periodIndexAt and mainUrlAt', () => {
  const periods = mainPeriods(history, code);

  it('counts a period’s start as part of it', () => {
    expect(periodIndexAt(periods, at('2026-03-01T00:00:00Z') - 1000)).toBe(0);
    expect(periodIndexAt(periods, at('2026-03-01T00:00:00Z'))).toBe(1);
    expect(periodIndexAt(periods, at('2026-06-01T00:00:00Z'))).toBe(2);
    expect(periodIndexAt(periods, at('2030-01-01T00:00:00Z'))).toBe(2);
  });

  it('puts a scan from before the first period in the first', () => {
    expect(periodIndexAt(periods, at('2025-12-31T23:59:59Z'))).toBe(0);
  });

  it('takes the later of two changes in the same second', () => {
    const same = mainPeriods(
      [
        { id: 1, url: 'https://example.com/a', startedAt: '2026-01-01T00:00:00.000Z' },
        { id: 2, url: 'https://example.com/b', startedAt: '2026-01-01T00:00:00.000Z' },
      ],
      code
    );
    expect(mainUrlAt(same, '2026-01-01T00:00:00.000Z')).toBe('https://example.com/b');
  });

  it('returns the URL that was live', () => {
    expect(mainUrlAt(periods, '2026-04-10T12:00:00.000Z')).toBe('https://example.com/b');
    expect(mainUrlAt(periods, at('2026-07-10T12:00:00Z'))).toBe('https://example.com/a');
  });

  it('agrees with a plain search at every hour for a year', () => {
    for (let t = at('2025-12-01T00:00:00Z'); t < at('2026-12-01T00:00:00Z'); t += 3600_000) {
      let expected = 0;
      periods.forEach((p, i) => {
        if (p.startedAt <= t) expected = i;
      });
      expect(periodIndexAt(periods, t)).toBe(expected);
    }
  });
});

describe('destinationRows', () => {
  const periods = mainPeriods(history, code);
  const nowMs = at('2026-07-01T00:00:00Z');
  const breakfast = {
    id: 10,
    label: 'Breakfast',
    kind: 'weekly',
    destinationUrl: 'https://example.com/breakfast',
    enabled: true,
    position: 0,
  };
  const sale = {
    id: 11,
    label: 'Sale',
    kind: 'range',
    destinationUrl: 'https://example.com/sale',
    startsAt: '2026-05-01T00:00:00.000Z',
    endsAt: '2026-05-03T00:00:00.000Z',
    enabled: true,
    position: 1,
  };
  const off = { ...breakfast, id: 12, label: 'Off', enabled: false, position: 2 };
  const counts = [
    { period: 0, scheduleId: null, url: 'https://example.com/a', scans: 30, uniques: 20 },
    { period: 1, scheduleId: null, url: 'https://example.com/b', scans: 50, uniques: 25 },
    { period: 1, scheduleId: null, url: 'https://example.com/a', scans: 1, uniques: 1 },
    { period: 2, scheduleId: null, url: 'https://example.com/a', scans: 15, uniques: 9 },
    { period: null, scheduleId: 11, url: 'https://example.com/sale', scans: 8, uniques: 6 },
    { period: null, scheduleId: 10, url: 'https://example.com/old-breakfast', scans: 4, uniques: 4 },
    { period: null, scheduleId: 10, url: 'https://example.com/breakfast', scans: 12, uniques: 7 },
    { period: null, scheduleId: 99, url: 'https://example.com/gone', scans: 2, uniques: 2 },
  ];
  const all = { periods, counts, schedules: [breakfast, sale, off], from: null, to: nowMs + DAY, nowMs };

  it('adds up to the code’s total', () => {
    const result = destinationRows(all);
    const total = counts.reduce((n, c) => n + c.scans, 0);
    expect(result.scans).toBe(total);
    expect([...result.main, ...result.schedules].reduce((n, r) => n + r.scans, 0)).toBe(total);
  });

  it('lists main-destination periods newest first, with their own URL before any other', () => {
    const { main } = destinationRows(all);
    expect(main.map((r) => [r.key, r.url, r.scans, r.otherUrl])).toEqual([
      ['period-3', 'https://example.com/a', 15, false],
      ['period-2', 'https://example.com/b', 50, false],
      ['period-2', 'https://example.com/a', 1, true],
      ['period-1', 'https://example.com/a', 30, false],
    ]);
    expect(main[0]).toMatchObject({ current: true, endedAt: null, startedAt: '2026-06-01T00:00:00.000Z', liveDays: 30 });
    expect(main[1]).toMatchObject({ current: false, endedAt: '2026-06-01T00:00:00.000Z', liveDays: 92 });
  });

  it('lists schedules in list order, current URL first, deleted ones last', () => {
    const { schedules } = destinationRows(all);
    expect(schedules.map((r) => [r.key, r.url, r.scans, r.otherUrl, r.schedule?.label ?? null])).toEqual([
      ['schedule-10', 'https://example.com/breakfast', 12, false, 'Breakfast'],
      ['schedule-10', 'https://example.com/old-breakfast', 4, true, 'Breakfast'],
      ['schedule-11', 'https://example.com/sale', 8, false, 'Sale'],
      ['schedule-99', 'https://example.com/gone', 2, false, null],
    ]);
  });

  it('shows periods and schedules that could have had scans, with none', () => {
    const from = at('2026-06-20T00:00:00Z');
    const { main, schedules, scans } = destinationRows({ ...all, counts: [], from });
    expect(scans).toBe(0);
    // Only the current period overlaps; it was live for 11 of the days so far.
    expect(main.map((r) => [r.key, r.scans, r.liveDays])).toEqual([['period-3', 0, 11]]);
    // Breakfast is on; the sale ended before the range and the other one is off.
    expect(schedules.map((r) => [r.key, r.scans])).toEqual([['schedule-10', 0]]);
  });

  it('shows a date range that overlaps the range even without scans', () => {
    const { schedules } = destinationRows({ ...all, counts: [], from: at('2026-05-02T00:00:00Z') });
    expect(schedules.map((r) => r.key)).toEqual(['schedule-10', 'schedule-11']);
  });

  it('measures live days within the range only', () => {
    const { main } = destinationRows({ ...all, from: at('2026-05-01T00:00:00Z') });
    expect(main.find((r) => r.key === 'period-2' && !r.otherUrl).liveDays).toBe(31);
    // Periods outside the range still show if they somehow have scans.
    expect(main.some((r) => r.key === 'period-1')).toBe(true);
  });
});
