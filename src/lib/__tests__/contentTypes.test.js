import { describe, it, expect } from 'vitest';
import {
  CONTENT_TYPES,
  parseContent,
  contentFromDestination,
  destinationFor,
  encodedDataFor,
  describeContent,
  describeDestination,
  wifiPayload,
  isValidEmailAddress,
  cleanPhoneNumber,
  getContentType,
  isStaticType,
  isActionType,
  supportsSchedules,
  checkTitle,
  appLinkFor,
  MAX_DESTINATION_LENGTH,
} from '../contentTypes';

describe('content type lookups', () => {
  it('treats unknown and missing types as websites', () => {
    expect(getContentType(undefined).id).toBe('url');
    expect(getContentType('javascript').id).toBe('url');
    expect(getContentType('email').id).toBe('email');
  });

  it('knows how each type is handled', () => {
    expect(isStaticType('wifi')).toBe(true);
    expect(isStaticType('url')).toBe(false);
    expect(isActionType('email')).toBe(true);
    expect(isActionType('phone')).toBe(true);
    expect(isActionType('sms')).toBe(true);
    expect(isActionType('whatsapp')).toBe(false);
    expect(supportsSchedules('url')).toBe(true);
    expect(CONTENT_TYPES.filter((t) => supportsSchedules(t.id)).map((t) => t.id)).toEqual(['url']);
  });

  it('rejects an unknown type', () => {
    expect(parseContent('ftp', { url: 'x' })).toMatchObject({ ok: false });
    expect(parseContent(undefined, {})).toMatchObject({ ok: false });
  });
});

describe('website', () => {
  it('adds https:// and accepts only https links', () => {
    expect(parseContent('url', { url: 'example.com/a' })).toEqual({
      ok: true,
      content: { url: 'https://example.com/a' },
      destination: 'https://example.com/a',
    });
    expect(parseContent('url', { url: 'http://example.com' }).ok).toBe(false);
    expect(parseContent('url', { url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parseContent('url', { url: '' }).ok).toBe(false);
  });

  it('rejects control characters and over-long links', () => {
    expect(parseContent('url', { url: 'https://exa\nmple.com' }).ok).toBe(false);
    expect(parseContent('url', { url: 'https://example.com/‮' }).ok).toBe(false);
    const long = `https://example.com/${'a'.repeat(MAX_DESTINATION_LENGTH)}`;
    expect(parseContent('url', { url: long }).ok).toBe(false);
  });
});

describe('email', () => {
  it('builds a mailto: link with an encoded subject and body', () => {
    const r = parseContent('email', { to: 'hello@acme.co.za', subject: 'Hi & welcome', body: 'Line 1\nLine 2 + more' });
    expect(r.ok).toBe(true);
    expect(r.destination).toBe(
      'mailto:hello@acme.co.za?subject=Hi%20%26%20welcome&body=Line%201%0D%0ALine%202%20%2B%20more'
    );
  });

  it('leaves out empty fields', () => {
    expect(destinationFor('email', { to: 'a@b.co' })).toBe('mailto:a@b.co');
    expect(destinationFor('email', { to: 'a@b.co', body: 'Hi' })).toBe('mailto:a@b.co?body=Hi');
  });

  it('accepts one plain address only', () => {
    expect(isValidEmailAddress('first.last+tag@sub.example.com')).toBe(true);
    expect(isValidEmailAddress("o'brien@example.ie")).toBe(true);
    for (const bad of [
      'a@b',
      'no-at.example.com',
      'a@@b.com',
      'a,b@c.com',
      'a@b.com,evil@x.com',
      'a@b.com?bcc=evil@x.com',
      'a%40b@c.com',
      'a b@c.com',
      '.a@b.com',
      'a..b@c.com',
      'a@-b.com',
      'a@b.c0m',
      `${'a'.repeat(65)}@b.com`,
    ]) {
      expect(isValidEmailAddress(bad), bad).toBe(false);
    }
  });

  it("can't be made to add recipients or other headers", () => {
    // Everything in the subject and body is encoded, so "&bcc=" stays text.
    const r = parseContent('email', { to: 'a@b.co', subject: 'x&bcc=evil@x.com', body: 'y?cc=evil@x.com' });
    expect(r.destination).toBe('mailto:a@b.co?subject=x%26bcc%3Devil%40x.com&body=y%3Fcc%3Devil%40x.com');
    expect(new URL(r.destination).searchParams.get('bcc')).toBe(null);
  });

  it('rejects control and direction-changing characters', () => {
    expect(parseContent('email', { to: 'a@b.co', subject: 'Hi\nBcc: x' }).ok).toBe(false);
    expect(parseContent('email', { to: 'a@b.co', subject: 'evil‮moc.dog' }).ok).toBe(false);
    expect(parseContent('email', { to: 'a@b.co', body: 'ok\u0000' }).ok).toBe(false);
  });

  it('limits lengths', () => {
    expect(parseContent('email', { to: 'a@b.co', subject: 'x'.repeat(151) }).ok).toBe(false);
    expect(parseContent('email', { to: 'a@b.co', body: 'x'.repeat(1001) }).ok).toBe(false);
    // Fits the character limit but not the link once encoded.
    const r = parseContent('email', { to: 'a@b.co', body: '😀'.repeat(500) });
    expect(r).toMatchObject({ ok: false, field: 'body' });
  });
});

describe('phone and text message', () => {
  it('cleans the number', () => {
    expect(cleanPhoneNumber(' +27 (82) 123-4567 ')).toBe('+27821234567');
    expect(cleanPhoneNumber('082.123.4567')).toBe('0821234567');
    expect(cleanPhoneNumber('082 123 4567,1234')).toBe('');
    expect(cleanPhoneNumber('call me')).toBe('');
  });

  it('builds tel: and sms: links', () => {
    expect(destinationFor('phone', { number: '+27 82 123 4567' })).toBe('tel:+27821234567');
    expect(destinationFor('sms', { number: '082 123 4567', message: 'Stop & go' })).toBe(
      'sms:0821234567?body=Stop%20%26%20go'
    );
    expect(destinationFor('sms', { number: '10111' })).toBe('sms:10111');
  });

  it('rejects bad numbers', () => {
    for (const number of ['', '12', '+1234567890123456', '082*123', '+27 82 123 4567;ext=9', 'tel:+2782']) {
      expect(parseContent('phone', { number }).ok, number).toBe(false);
    }
  });
});

describe('WhatsApp', () => {
  it('needs the international number and builds a wa.me link', () => {
    expect(destinationFor('whatsapp', { number: '+27 82 123 4567', message: 'Hi there' })).toBe(
      'https://wa.me/27821234567?text=Hi%20there'
    );
    expect(destinationFor('whatsapp', { number: '0027821234567' })).toBe('https://wa.me/27821234567');
    expect(parseContent('whatsapp', { number: '082 123 4567' }).ok).toBe(false);
  });
});

describe('location', () => {
  it('builds a Google Maps search link', () => {
    expect(destinationFor('location', { query: '1 Long St, Cape Town' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=1%20Long%20St%2C%20Cape%20Town'
    );
    expect(destinationFor('location', { query: '-33.92,18.42' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=-33.92%2C18.42'
    );
    expect(parseContent('location', { query: '  ' }).ok).toBe(false);
  });
});

describe('reading content back from a destination', () => {
  const samples = [
    ['url', { url: 'https://example.com/x?y=1' }],
    ['email', { to: 'hello@acme.co.za', subject: 'Hi + bye', body: 'One\nTwo & three' }],
    ['email', { to: 'a@b.co', subject: '', body: '' }],
    ['phone', { number: '+27821234567' }],
    ['sms', { number: '+27821234567', message: 'Ünïcode ✓ 100%' }],
    ['whatsapp', { number: '+27821234567', message: 'Hello?' }],
    ['location', { query: 'Table Mountain' }],
  ];

  it.each(samples)('round-trips %s', (type, content) => {
    const destination = destinationFor(type, content);
    expect(contentFromDestination(type, destination)).toEqual(parseContent(type, content).content);
  });

  it('refuses destinations this type didn’t build', () => {
    expect(contentFromDestination('email', 'https://evil.example')).toBe(null);
    expect(contentFromDestination('email', 'mailto:a@b.co?subject=x&bcc=evil@x.com')).toBe(null);
    expect(contentFromDestination('phone', 'javascript:alert(1)')).toBe(null);
    expect(contentFromDestination('whatsapp', 'https://evil.example/27821234567')).toBe(null);
    expect(contentFromDestination('location', 'https://www.google.com.evil.example/maps')).toBe(null);
    expect(contentFromDestination('sms', 'sms:+27821234567?body=a+b')).toBe(null);
    expect(contentFromDestination('wifi', 'WIFI:S:x;;')).toBe(null);
    expect(contentFromDestination('email', '')).toBe(null);
  });
});

describe('Wi-Fi', () => {
  it('builds the WIFI: text phones read', () => {
    const r = parseContent('wifi', { ssid: 'Cafe Guest', security: 'WPA', password: 'coffee1234' });
    expect(r).toMatchObject({ ok: true, destination: '' });
    expect(wifiPayload(r.content)).toBe('WIFI:T:WPA;S:Cafe Guest;P:coffee1234;;');
  });

  it('escapes the characters that have a meaning in it', () => {
    const r = parseContent('wifi', { ssid: 'A;B,C:D"E\\F', security: 'WPA', password: 'p;ss:w,rd"\\' });
    expect(wifiPayload(r.content)).toBe('WIFI:T:WPA;S:A\\;B\\,C\\:D\\"E\\\\F;P:p\\;ss\\:w\\,rd\\"\\\\;;');
  });

  it('handles open and hidden networks', () => {
    const open = parseContent('wifi', { ssid: 'Free', security: 'nopass', password: 'ignored' });
    expect(open.content.password).toBe('');
    expect(wifiPayload(open.content)).toBe('WIFI:T:nopass;S:Free;;');
    const hidden = parseContent('wifi', { ssid: 'Back office', security: 'WPA', password: '12345678', hidden: true });
    expect(wifiPayload(hidden.content)).toBe('WIFI:T:WPA;S:Back office;P:12345678;H:true;;');
  });

  it('keeps the name and password exactly as typed', () => {
    const r = parseContent('wifi', { ssid: ' Net ', security: 'WPA', password: ' spaced out ' });
    expect(r.content).toMatchObject({ ssid: ' Net ', password: ' spaced out ' });
  });

  it('checks the name and password', () => {
    const wpa = (over) => parseContent('wifi', { ssid: 'Net', security: 'WPA', password: 'password1', ...over });
    expect(wpa({ ssid: '' }).ok).toBe(false);
    expect(wpa({ ssid: '   ' }).ok).toBe(false);
    expect(wpa({ ssid: 'x'.repeat(33) }).ok).toBe(false);
    expect(wpa({ ssid: 'é'.repeat(17) }).ok).toBe(false); // 34 bytes
    expect(wpa({ ssid: 'Net\n' }).ok).toBe(false);
    expect(wpa({ password: 'short' }).ok).toBe(false);
    expect(wpa({ password: 'x'.repeat(64) }).ok).toBe(false);
    expect(wpa({ password: 'a'.repeat(64).replace(/a/g, 'f') }).ok).toBe(true); // hex key
    expect(wpa({ password: 'pässwörd1' }).ok).toBe(false);
    expect(wpa({ password: '' }).ok).toBe(false);
  });

  it('only offers WPA or no password (never WEP)', () => {
    const r = parseContent('wifi', { ssid: 'Net', security: 'WEP', password: 'password1' });
    expect(r.content.security).toBe('WPA');
  });

  it('puts the Wi-Fi text in the image, and the QR Go link for other types', () => {
    const content = { ssid: 'Net', security: 'WPA', password: 'password1' };
    expect(encodedDataFor('wifi', { redirectUrl: 'https://x/r/abc', content })).toBe('WIFI:T:WPA;S:Net;P:password1;;');
    expect(encodedDataFor('wifi', { redirectUrl: 'https://x/r/abc', content: null })).toBe(null);
    expect(encodedDataFor('email', { redirectUrl: 'https://x/r/abc', content: null })).toBe('https://x/r/abc');
  });
});

describe('describing content', () => {
  it('never shows a Wi-Fi password', () => {
    const d = describeContent('wifi', { ssid: 'Net', security: 'WPA', password: 'secret123' });
    expect(d).toEqual({ label: 'Wi-Fi', detail: 'Net' });
    expect(JSON.stringify(d)).not.toContain('secret123');
  });

  it('describes each kind of destination', () => {
    expect(describeContent('email', { to: 'a@b.co' })).toEqual({ label: 'Email', detail: 'a@b.co' });
    expect(describeContent('url', { url: 'https://x.co/y' })).toEqual({ label: 'Website', detail: 'x.co/y' });
    expect(describeDestination('mailto:a@b.co?subject=Hi')).toBe('Email a@b.co');
    expect(describeDestination('tel:+27821234567')).toBe('Call +27821234567');
    expect(describeDestination('sms:+27821234567?body=x')).toBe('Text +27821234567');
    expect(describeDestination('https://example.com/a')).toBe('example.com/a');
  });
});

describe('checkTitle', () => {
  it('requires a short, plain title', () => {
    expect(checkTitle('  Menu  ')).toEqual({ value: 'Menu' });
    expect(checkTitle('').error).toBeTruthy();
    expect(checkTitle('x'.repeat(256)).error).toBeTruthy();
    expect(checkTitle('a\u0000b').error).toBeTruthy();
  });
});

describe('appLinkFor', () => {
  it('gives the checked link for email, phone and text message codes', () => {
    expect(appLinkFor('email', 'mailto:a@b.co?subject=Hi')).toBe('mailto:a@b.co?subject=Hi');
    expect(appLinkFor('phone', 'tel:+27821234567')).toBe('tel:+27821234567');
    expect(appLinkFor('sms', 'sms:+27821234567?body=INFO')).toBe('sms:+27821234567?body=INFO');
  });

  it('is null for other types and for links this file didn’t build', () => {
    expect(appLinkFor('url', 'https://example.com')).toBe(null);
    expect(appLinkFor('whatsapp', 'https://wa.me/27821234567')).toBe(null);
    expect(appLinkFor('email', 'javascript:alert(1)')).toBe(null);
    expect(appLinkFor('email', 'mailto:a@b.co?bcc=evil@x.com')).toBe(null);
    expect(appLinkFor('phone', 'https://evil.example')).toBe(null);
  });
});
