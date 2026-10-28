import { describe, it, expect } from 'vitest';
import {
  parseAnalyticsFilters,
  parseOffsetMinutes,
  computePeriods,
  bucketForDays,
  bucketKeys,
  toSqlDateTime,
  sqlToIso,
  percentChange,
} from '../analyticsFilters';
import { visitorHash } from '../visitor';
import { csvCell, csvRow } from '../csv';
import { retentionMonths, retentionCutoff } from '../retention';
import { publicIp, toLocation, createGeoLookup } from '../geo';

const params = (query) => new URLSearchParams(query);
const utc = (s) => Date.parse(`${s}Z`);

describe('parseAnalyticsFilters', () => {
  it('defaults to the last 30 days in UTC with no filters', () => {
    expect(parseAnalyticsFilters(params(''))).toEqual({
      range: '30d',
      offsetMinutes: 0,
      codeId: null,
      collectionId: null,
      accountId: null,
    });
  });

  it('reads every filter', () => {
    expect(
      parseAnalyticsFilters(params('range=7d&tz=-120&codeId=12&collectionId=default&accountId=3'))
    ).toEqual({ range: '7d', offsetMinutes: 120, codeId: 12, collectionId: 'default', accountId: 3 });
    expect(parseAnalyticsFilters(params('collectionId=4')).collectionId).toBe(4);
  });

  it('rejects bad values', () => {
    expect(parseAnalyticsFilters(params('range=5y'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('range=toString'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('codeId=abc'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('codeId=0'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('codeId=-1'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('collectionId=1.5'))).toHaveProperty('error');
    expect(parseAnalyticsFilters(params('accountId=x'))).toHaveProperty('error');
  });
});

describe('parseOffsetMinutes', () => {
  it('flips the browser offset and ignores nonsense', () => {
    expect(parseOffsetMinutes('-120')).toBe(120);
    expect(parseOffsetMinutes('300')).toBe(-300);
    expect(parseOffsetMinutes('0')).toBe(0);
    expect(parseOffsetMinutes('9999')).toBe(0);
    expect(parseOffsetMinutes('1; DROP TABLE')).toBe(0);
    expect(parseOffsetMinutes(null)).toBe(0);
  });
});

describe('computePeriods', () => {
  const now = utc('2026-10-28T23:30:00'); // 01:30 on the 29th in South Africa

  it('ends at the end of the viewer’s today and starts N local days earlier', () => {
    const p = computePeriods('7d', now, 120);
    expect(new Date(p.to).toISOString()).toBe('2026-10-29T22:00:00.000Z'); // midnight 30 Oct SAST
    expect(new Date(p.from).toISOString()).toBe('2026-10-22T22:00:00.000Z'); // midnight 23 Oct SAST
    expect(new Date(p.prevFrom).toISOString()).toBe('2026-10-15T22:00:00.000Z');
    expect(p.prevTo).toBe(p.from);
    expect(p.bucket).toBe('day');
  });

  it('uses weeks for 12 months', () => {
    expect(computePeriods('12m', now, 0).bucket).toBe('week');
  });

  it('starts "all" at the first scan, with no previous period', () => {
    const p = computePeriods('all', now, 0, utc('2026-10-01T10:00:00'));
    expect(new Date(p.from).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(p.prevFrom).toBeNull();
    expect(p.bucket).toBe('day');
    expect(computePeriods('all', now, 0, null).from).toBe(utc('2026-10-28T00:00:00'));
  });

  it('picks bucket sizes by span', () => {
    expect(bucketForDays(90)).toBe('day');
    expect(bucketForDays(91)).toBe('week');
    expect(bucketForDays(731)).toBe('month');
  });
});

describe('bucketKeys', () => {
  it('lists every local day', () => {
    const p = computePeriods('7d', utc('2026-10-28T12:00:00'), 120);
    expect(bucketKeys({ ...p, offsetMinutes: 120 })).toEqual([
      '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
    ]);
  });

  it('groups weeks by Monday and months by the 1st', () => {
    const from = utc('2026-10-01T00:00:00'); // a Thursday
    const to = utc('2026-11-03T00:00:00');
    expect(bucketKeys({ from, to, bucket: 'week', offsetMinutes: 0 })).toEqual([
      '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02',
    ]);
    expect(bucketKeys({ from, to, bucket: 'month', offsetMinutes: 0 })).toEqual(['2026-10-01', '2026-11-01']);
  });
});

describe('date formatting', () => {
  it('round-trips MySQL UTC strings', () => {
    expect(toSqlDateTime(utc('2026-10-28T09:05:03'))).toBe('2026-10-28 09:05:03');
    expect(sqlToIso('2026-10-28 09:05:03')).toBe('2026-10-28T09:05:03Z');
    expect(sqlToIso(null)).toBeNull();
  });
});

describe('percentChange', () => {
  it('compares with the previous period', () => {
    expect(percentChange(118, 100)).toBe(18);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
  });
});

describe('visitorHash', () => {
  it('is stable, short and keyed', () => {
    const a = visitorHash('41.1.2.3', 'UA', 'secret');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(visitorHash('41.1.2.3', 'UA', 'secret')).toBe(a);
    expect(visitorHash('41.1.2.4', 'UA', 'secret')).not.toBe(a);
    expect(visitorHash('41.1.2.3', 'Other UA', 'secret')).not.toBe(a);
    expect(visitorHash('41.1.2.3', 'UA', 'other secret')).not.toBe(a);
  });

  it('gives no ID without an IP or secret', () => {
    expect(visitorHash('unknown', 'UA', 'secret')).toBeNull();
    expect(visitorHash('', 'UA', 'secret')).toBeNull();
    expect(visitorHash('41.1.2.3', 'UA', null)).toBeNull();
  });
});

describe('csv', () => {
  it('quotes and escapes cells', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvRow(['a', 1, null])).toBe('a,1,\r\n');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+27 21')).toBe("'+27 21");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('retention', () => {
  it('defaults to 24 months and accepts 0 for forever', () => {
    expect(retentionMonths(undefined)).toBe(24);
    expect(retentionMonths('')).toBe(24);
    expect(retentionMonths('12')).toBe(12);
    expect(retentionMonths('0')).toBe(0);
    expect(retentionMonths('abc')).toBe(24);
    expect(retentionMonths('-3')).toBe(24);
  });

  it('computes the cutoff', () => {
    expect(new Date(retentionCutoff(utc('2026-10-28T12:00:00'), 24)).toISOString()).toBe(
      '2024-10-28T12:00:00.000Z'
    );
    expect(retentionCutoff(Date.now(), 0)).toBeNull();
  });
});

describe('geo', () => {
  it('only looks up public addresses', () => {
    expect(publicIp('41.13.0.1')).toBe('41.13.0.1');
    expect(publicIp('::ffff:41.13.0.1')).toBe('41.13.0.1');
    expect(publicIp('41.13.0.1:51234')).toBe('41.13.0.1');
    expect(publicIp('2c0f:f4c0::1')).toBe('2c0f:f4c0::1');
    expect(publicIp('127.0.0.1')).toBeNull();
    expect(publicIp('192.168.0.44')).toBeNull();
    expect(publicIp('100.64.0.1')).toBeNull();
    expect(publicIp('unknown')).toBeNull();
    expect(publicIp(undefined)).toBeNull();
  });

  it('maps a city record', () => {
    expect(
      toLocation({
        country: { iso_code: 'ZA', names: { en: 'South Africa' } },
        subdivisions: [{ names: { en: 'Western Cape' } }],
        city: { names: { en: 'Cape Town' } },
      })
    ).toEqual({ countryCode: 'ZA', region: 'Western Cape', city: 'Cape Town' });
    expect(toLocation({ country: { iso_code: 'ZA' } })).toEqual({
      countryCode: 'ZA',
      region: null,
      city: null,
    });
    expect(toLocation(null)).toEqual({ countryCode: null, region: null, city: null });
  });

  it('returns nulls when the database file is missing', async () => {
    const lookup = createGeoLookup('/nonexistent/dbip.mmdb');
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(await lookup('41.13.0.1')).toEqual({ countryCode: null, region: null, city: null });
    } finally {
      console.warn = warn;
    }
  });
});
