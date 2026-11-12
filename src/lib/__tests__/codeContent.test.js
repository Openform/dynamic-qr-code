import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sealContent, openContent, clientContent } from '../codeContent';

const SECRET = 'test-secret-that-is-long-enough';
const WIFI = { ssid: 'Cafe', security: 'WPA', password: 'coffee1234', hidden: false };

describe('sealContent / openContent', () => {
  it('round-trips content', () => {
    const sealed = sealContent(WIFI, 'abc123', SECRET);
    expect(openContent(sealed, 'abc123', SECRET)).toEqual(WIFI);
  });

  it('never stores the content in the clear', () => {
    const sealed = sealContent(WIFI, 'abc123', SECRET);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('coffee1234');
    expect(sealed).not.toContain('Cafe');
    expect(Buffer.from(sealed.split('.')[3], 'base64url').toString('utf8')).not.toContain('coffee');
  });

  it('uses a fresh IV every time', () => {
    expect(sealContent(WIFI, 'abc123', SECRET)).not.toBe(sealContent(WIFI, 'abc123', SECRET));
  });

  it("won't open with another secret or on another code", () => {
    const sealed = sealContent(WIFI, 'abc123', SECRET);
    expect(openContent(sealed, 'abc123', 'another-secret')).toBe(null);
    expect(openContent(sealed, 'xyz789', SECRET)).toBe(null);
  });

  it("won't open when tampered with", () => {
    const sealed = sealContent(WIFI, 'abc123', SECRET);
    const parts = sealed.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 1;
    parts[3] = ct.toString('base64url');
    expect(openContent(parts.join('.'), 'abc123', SECRET)).toBe(null);
    expect(openContent('v2.a.b.c', 'abc123', SECRET)).toBe(null);
    expect(openContent('not sealed', 'abc123', SECRET)).toBe(null);
    expect(openContent(null, 'abc123', SECRET)).toBe(null);
    expect(openContent(JSON.stringify(WIFI), 'abc123', SECRET)).toBe(null);
  });

  it('refuses to seal without a secret', () => {
    expect(() => sealContent(WIFI, 'abc123', '')).toThrow();
    expect(() => sealContent(WIFI, '', SECRET)).toThrow();
  });
});

describe('clientContent', () => {
  let saved;
  beforeEach(() => {
    saved = { CONTENT_SECRET: process.env.CONTENT_SECRET, JWT_SECRET: process.env.JWT_SECRET };
    process.env.CONTENT_SECRET = SECRET;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('decrypts static content for the owner', () => {
    const contentData = sealContent(WIFI, 'abc123');
    expect(clientContent({ contentType: 'wifi', destinationUrl: '', contentData, shortId: 'abc123' })).toEqual(WIFI);
  });

  it('reads other types from the destination', () => {
    expect(
      clientContent({ contentType: 'email', destinationUrl: 'mailto:a@b.co?subject=Hi', shortId: 'x' })
    ).toEqual({ to: 'a@b.co', subject: 'Hi', body: '' });
    expect(clientContent({ contentType: 'url', destinationUrl: 'example.com', shortId: 'x' })).toEqual({
      url: 'example.com',
    });
    expect(clientContent({ contentType: undefined, destinationUrl: 'https://a.co', shortId: 'x' })).toEqual({
      url: 'https://a.co',
    });
  });

  it('falls back to JWT_SECRET', () => {
    delete process.env.CONTENT_SECRET;
    process.env.JWT_SECRET = 'jwt-secret';
    const contentData = sealContent(WIFI, 'abc123');
    expect(openContent(contentData, 'abc123', 'jwt-secret')).toEqual(WIFI);
  });
});
