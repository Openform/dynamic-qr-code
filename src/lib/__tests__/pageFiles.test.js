import { describe, it, expect } from 'vitest';
import { contactFile, eventFile, fileName, fileResponse, parseFileParam } from '../pageFiles';

const NOW = Date.parse('2026-11-16T10:00:00Z');

/** A file's content lines, with folded lines joined back up. */
const unfold = (text) => text.replace(/\r\n /g, '').split('\r\n');

describe('eventFile', () => {
  const event = { title: 'Summer market', startsAt: '2026-12-06T08:00:00.000Z', endsAt: '2026-12-06T12:00:00.000Z', location: '', details: '' };

  it('makes an iCalendar event in UTC, with CRLF line ends', () => {
    const text = eventFile(event, { uid: 'page-4-b-cal@qrgo', nowMs: NOW });
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(unfold(text)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//QR Go//Campaign page//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:page-4-b-cal@qrgo',
      'DTSTAMP:20261116T100000Z',
      'DTSTART:20261206T080000Z',
      'DTEND:20261206T120000Z',
      'SUMMARY:Summer market',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('lasts an hour when it has no end', () => {
    expect(unfold(eventFile({ ...event, endsAt: '' }, { uid: 'x', nowMs: NOW }))).toContain('DTEND:20261206T090000Z');
  });

  it('escapes what the owner typed, so it can’t start a new line or field', () => {
    const text = eventFile(
      { ...event, title: 'Food, music; fun', location: 'Back\\yard', details: 'Line one\nEND:VEVENT\nLine three' },
      { uid: 'x', nowMs: NOW }
    );
    const lines = unfold(text);
    expect(lines).toContain('SUMMARY:Food\\, music\\; fun');
    expect(lines).toContain('LOCATION:Back\\\\yard');
    expect(lines).toContain('DESCRIPTION:Line one\\nEND:VEVENT\\nLine three');
    expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(1);
  });

  it('folds long lines at 75 bytes without splitting a character', () => {
    const details = 'Café ☕ and music under the oaks, '.repeat(6).trim();
    const text = eventFile({ ...event, details }, { uid: 'x', nowMs: NOW });
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(text)).toContain(`DESCRIPTION:${details.replace(/,/g, '\\,')}`);
  });
});

describe('contactFile', () => {
  it('makes a vCard 3.0 with the details given', () => {
    const text = contactFile({ name: 'Thandi Mokoena', organisation: 'Bean There, Café', phone: '0821234567', email: 'thandi@example.com', website: 'https://example.com', address: 'Shop 4; The Old Mill' });
    expect(unfold(text)).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Thandi Mokoena;;;;',
      'FN:Thandi Mokoena',
      'ORG:Bean There\\, Café',
      'TEL;TYPE=VOICE:0821234567',
      'EMAIL;TYPE=INTERNET:thandi@example.com',
      'URL:https://example.com',
      'ADR;TYPE=WORK:;;Shop 4\\; The Old Mill;;;;',
      'END:VCARD',
      '',
    ]);
  });

  it('leaves out the details that aren’t given', () => {
    const lines = unfold(contactFile({ name: 'Bean There', organisation: '', phone: '', email: 'hello@example.com', website: '', address: '' }));
    expect(lines).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Bean There;;;;', 'FN:Bean There', 'EMAIL;TYPE=INTERNET:hello@example.com', 'END:VCARD', '']);
  });
});

describe('file addresses and names', () => {
  it('reads "<button id>.ics" and "<button id>.vcf" and nothing else', () => {
    expect(parseFileParam('button-1.ics')).toEqual({ buttonId: 'button-1', type: 'ics' });
    expect(parseFileParam('b_2.vcf')).toEqual({ buttonId: 'b_2', type: 'vcf' });
    for (const value of ['button-1', 'button-1.txt', '../a.ics', 'a.ics.vcf', '.ics', undefined]) expect(parseFileParam(value)).toBeNull();
  });

  it('names files after the event or contact, safely', () => {
    expect(fileName('Summer Market 2026!', 'ics')).toBe('summer-market-2026.ics');
    expect(fileName('Café "Bean" There', 'vcf')).toBe('cafe-bean-there.vcf');
    expect(fileName('☕☕', 'vcf')).toBe('contact.vcf');
    expect(fileName('', 'ics')).toBe('event.ics');
  });

  it('downloads with the right type, and is never cached', async () => {
    const response = fileResponse(
      { type: 'vcf', fields: { name: 'Bean There', organisation: '', phone: '0215550100', email: '', website: '', address: '' } },
      { uid: 'x' }
    );
    expect(response.headers.get('content-type')).toBe('text/vcard; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="bean-there.vcf"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toContain('TEL;TYPE=VOICE:0215550100');
  });
});
