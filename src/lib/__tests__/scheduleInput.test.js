import { describe, it, expect } from 'vitest';
import { parseScheduleInput, onlySwitchesOff, isValidTimeZone } from '../scheduleInput';

const NOW = Date.parse('2026-11-09T12:00:00Z');

const valid = {
  label: '  Black Friday ',
  destinationUrl: 'example.com/black-friday',
  timeZone: 'Africa/Johannesburg',
  startsAt: '2026-11-28T00:00:00+02:00',
  endsAt: '2026-12-01T00:00:00+02:00',
};

// A stored schedule, as db.js returns it.
const existing = {
  id: 5,
  kind: 'range',
  label: 'Black Friday',
  destinationUrl: 'https://example.com/black-friday',
  timeZone: 'Africa/Johannesburg',
  startsAt: '2026-11-27T22:00:00Z',
  endsAt: '2026-11-30T22:00:00Z',
  enabled: true,
};

describe('parseScheduleInput: a new schedule', () => {
  it('accepts a date range, ready to store in UTC', () => {
    expect(parseScheduleInput(valid, { nowMs: NOW })).toEqual({
      fields: {
        kind: 'range',
        label: 'Black Friday',
        destinationUrl: 'https://example.com/black-friday',
        timeZone: 'Africa/Johannesburg',
        startsAt: '2026-11-27 22:00:00',
        endsAt: '2026-11-30 22:00:00',
      },
    });
  });

  it('can start in the past, so it goes live straight away', () => {
    const body = { ...valid, startsAt: '2026-11-01T00:00:00Z' };
    expect(parseScheduleInput(body, { nowMs: NOW })).not.toHaveProperty('error');
  });

  it('needs every field', () => {
    for (const key of Object.keys(valid)) {
      const body = { ...valid };
      delete body[key];
      expect(parseScheduleInput(body, { nowMs: NOW }), key).toHaveProperty('error');
    }
  });

  it('refuses unknown kinds', () => {
    expect(parseScheduleInput({ ...valid, kind: 'monthly' }, { nowMs: NOW }).error).toMatch(/Unknown kind/);
  });

  it('checks the name, URL and time zone', () => {
    expect(parseScheduleInput({ ...valid, label: '   ' }, { nowMs: NOW }).error).toBe('Give the schedule a name.');
    expect(parseScheduleInput({ ...valid, label: 'x'.repeat(101) }, { nowMs: NOW }).error).toMatch(/at most 100/);
    expect(parseScheduleInput({ ...valid, label: 'x'.repeat(100) }, { nowMs: NOW })).not.toHaveProperty('error');
    expect(parseScheduleInput({ ...valid, destinationUrl: 'http://example.com' }, { nowMs: NOW }).error).toMatch(/https/);
    expect(parseScheduleInput({ ...valid, timeZone: 'Mars/Olympus' }, { nowMs: NOW }).error).toBe('Unknown time zone.');
  });

  it('checks the dates', () => {
    const check = (fields) => parseScheduleInput({ ...valid, ...fields }, { nowMs: NOW }).error;
    expect(check({ startsAt: '2026-11-28 00:00' })).toBe('Choose when the schedule starts.');
    expect(check({ endsAt: 'soon' })).toBe('Choose when the schedule ends.');
    expect(check({ endsAt: valid.startsAt })).toBe('The end must be after the start.');
    expect(check({ startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' })).toBe('The end must be in the future.');
    expect(check({ endsAt: '2032-01-01T00:00:00Z' })).toBe('Choose an end within the next 5 years.');
  });

  it('refuses a body that isn’t an object', () => {
    for (const body of [null, 'text', [valid]]) {
      expect(parseScheduleInput(body, { nowMs: NOW })).toEqual({ error: 'Send the schedule as JSON.' });
    }
  });
});

// Monday to Friday, 07:00–11:00 in London.
const validWeekly = {
  kind: 'weekly',
  label: 'Breakfast',
  destinationUrl: 'example.com/breakfast',
  timeZone: 'Europe/London',
  days: 1 | 2 | 4 | 8 | 16,
  startTime: '07:00',
  endTime: '11:00',
};

const existingWeekly = {
  id: 6,
  kind: 'weekly',
  label: 'Breakfast',
  destinationUrl: 'https://example.com/breakfast',
  timeZone: 'Europe/London',
  days: 31,
  startTime: '07:00',
  endTime: '11:00',
  enabled: true,
};

describe('parseScheduleInput: a new weekly schedule', () => {
  it('accepts days, times and a time zone', () => {
    expect(parseScheduleInput(validWeekly, { nowMs: NOW })).toEqual({
      fields: {
        kind: 'weekly',
        label: 'Breakfast',
        destinationUrl: 'https://example.com/breakfast',
        timeZone: 'Europe/London',
        days: 31,
        startTime: '07:00',
        endTime: '11:00',
      },
    });
  });

  it('accepts windows past midnight and all day, and times with :00 seconds', () => {
    const late = parseScheduleInput({ ...validWeekly, startTime: '22:00', endTime: '02:00' }, { nowMs: NOW });
    expect(late.fields).toMatchObject({ startTime: '22:00', endTime: '02:00' });
    const allDay = parseScheduleInput({ ...validWeekly, startTime: '00:00', endTime: '00:00' }, { nowMs: NOW });
    expect(allDay.fields).toMatchObject({ startTime: '00:00', endTime: '00:00' });
    const seconds = parseScheduleInput({ ...validWeekly, startTime: '07:30:00', endTime: '23:59' }, { nowMs: NOW });
    expect(seconds.fields).toMatchObject({ startTime: '07:30', endTime: '23:59' });
  });

  it('needs every field', () => {
    for (const key of Object.keys(validWeekly).filter((k) => k !== 'kind')) {
      const body = { ...validWeekly };
      delete body[key];
      expect(parseScheduleInput(body, { nowMs: NOW }), key).toHaveProperty('error');
    }
  });

  it('checks the days and times', () => {
    const check = (fields) => parseScheduleInput({ ...validWeekly, ...fields }, { nowMs: NOW }).error;
    expect(check({ days: 0 })).toBe('Choose at least one day.');
    for (const days of [128, -1, 1.5, '31', null]) expect(check({ days }), String(days)).toMatch(/1 to 127/);
    expect(check({ days: 127 })).toBeUndefined();
    for (const startTime of ['24:00', '7:00', '07:60', '07:00:30', 'noon', null]) {
      expect(check({ startTime }), String(startTime)).toBe('Choose when the schedule starts each day.');
    }
    expect(check({ endTime: '' })).toBe('Choose when the schedule ends each day.');
    expect(check({ timeZone: 'Mars/Olympus' })).toBe('Unknown time zone.');
  });

  it('refuses dates on a weekly schedule, and days or times on a date range', () => {
    expect(parseScheduleInput({ ...validWeekly, endsAt: valid.endsAt }, { nowMs: NOW }).error).toMatch(/no dates/);
    expect(parseScheduleInput({ ...valid, days: 31 }, { nowMs: NOW }).error).toMatch(/no days or times/);
    expect(parseScheduleInput({ ...valid, kind: 'range', startTime: '07:00' }, { nowMs: NOW }).error).toMatch(
      /no days or times/
    );
  });
});

describe('parseScheduleInput: an edit', () => {
  it('returns only what changes', () => {
    expect(parseScheduleInput({ label: 'Cyber Monday' }, { existing, nowMs: NOW })).toEqual({
      fields: { label: 'Cyber Monday' },
    });
    expect(parseScheduleInput({ enabled: false }, { existing, nowMs: NOW })).toEqual({ fields: { enabled: false } });
  });

  it('checks a new date against the stored one', () => {
    // Moving the end before the stored start.
    expect(parseScheduleInput({ endsAt: '2026-11-27T00:00:00Z' }, { existing, nowMs: NOW }).error).toBe(
      'The end must be after the start.'
    );
    expect(parseScheduleInput({ endsAt: '2026-12-02T00:00:00Z' }, { existing, nowMs: NOW })).toEqual({
      fields: { endsAt: '2026-12-02 00:00:00' },
    });
  });

  it('lets an ended schedule be renamed, but its dates moved only into the future', () => {
    const later = Date.parse('2026-12-15T00:00:00Z');
    expect(parseScheduleInput({ label: 'Black Friday 2026' }, { existing, nowMs: later })).not.toHaveProperty('error');
    expect(parseScheduleInput({ startsAt: '2026-11-26T00:00:00Z' }, { existing, nowMs: later }).error).toBe(
      'The end must be in the future.'
    );
  });

  it('changes a weekly schedule’s days, times and time zone', () => {
    const body = { days: 96, startTime: '22:00', endTime: '02:00', timeZone: 'Africa/Johannesburg' };
    expect(parseScheduleInput(body, { existing: existingWeekly, nowMs: NOW })).toEqual({ fields: body });
    expect(parseScheduleInput({ days: 0 }, { existing: existingWeekly, nowMs: NOW }).error).toBe(
      'Choose at least one day.'
    );
    expect(parseScheduleInput({ startsAt: valid.startsAt }, { existing: existingWeekly, nowMs: NOW }).error).toMatch(
      /no dates/
    );
    expect(parseScheduleInput({ days: 31 }, { existing, nowMs: NOW }).error).toMatch(/no days or times/);
  });

  it('refuses a change of kind, a bad switch value, or nothing to change', () => {
    expect(parseScheduleInput({ kind: 'weekly' }, { existing, nowMs: NOW }).error).toMatch(/kind can’t be changed/);
    expect(parseScheduleInput({ enabled: 'no' }, { existing, nowMs: NOW }).error).toMatch(/true or false/);
    expect(parseScheduleInput({}, { existing, nowMs: NOW })).toEqual({ error: 'Nothing to change.' });
  });
});

describe('onlySwitchesOff', () => {
  it('is true only for switching off alone', () => {
    expect(onlySwitchesOff({ enabled: false })).toBe(true);
    expect(onlySwitchesOff({ enabled: true })).toBe(false);
    expect(onlySwitchesOff({ enabled: false, label: 'x' })).toBe(false);
    expect(onlySwitchesOff({})).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('knows IANA names', () => {
    expect(isValidTimeZone('Africa/Johannesburg')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(`Europe/${'x'.repeat(64)}`)).toBe(false);
  });
});
