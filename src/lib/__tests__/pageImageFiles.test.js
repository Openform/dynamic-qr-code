import { describe, it, expect } from 'vitest';
import { checkImageFile, imageType, parseImageParam, imageHeaders, MAX_IMAGE_BYTES } from '../pageImageFiles';

// A real 1×1 PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function png(width, height) {
  const bytes = Buffer.from(PNG_1X1);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** The start of a JPEG: SOI, an APP0 segment, then a baseline frame header. */
function jpeg(width, height, sofMarker = 0xc0) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xff00 | sofMarker, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(16)]);
}

function riff(chunk, body) {
  const head = Buffer.alloc(20);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(12 + body.length, 4);
  head.write('WEBP', 8, 'latin1');
  head.write(chunk, 12, 'latin1');
  head.writeUInt32LE(body.length, 16);
  return Buffer.concat([head, body]);
}

function webpExtended(width, height) {
  const body = Buffer.alloc(10);
  body.writeUIntLE(width - 1, 4, 3);
  body.writeUIntLE(height - 1, 7, 3);
  return riff('VP8X', body);
}

function webpLossless(width, height) {
  const body = Buffer.alloc(10);
  body[0] = 0x2f;
  body.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  return riff('VP8L', body);
}

function webpLossy(width, height) {
  const body = Buffer.alloc(10);
  body[3] = 0x9d;
  body[4] = 0x01;
  body[5] = 0x2a;
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  return riff('VP8 ', body);
}

describe('checkImageFile', () => {
  it('reads the type and size of JPEG, PNG and WebP files', () => {
    expect(checkImageFile(PNG_1X1)).toMatchObject({ ok: true, mimeType: 'image/png', width: 1, height: 1 });
    expect(checkImageFile(png(1600, 900))).toMatchObject({ ok: true, mimeType: 'image/png', width: 1600, height: 900 });
    expect(checkImageFile(jpeg(1600, 1067))).toMatchObject({ ok: true, mimeType: 'image/jpeg', width: 1600, height: 1067 });
    // A progressive JPEG has its size in SOF2.
    expect(checkImageFile(jpeg(800, 600, 0xc2))).toMatchObject({ ok: true, width: 800, height: 600 });
    expect(checkImageFile(webpExtended(1600, 900))).toMatchObject({ ok: true, mimeType: 'image/webp', width: 1600, height: 900 });
    expect(checkImageFile(webpLossless(512, 512))).toMatchObject({ ok: true, width: 512, height: 512 });
    expect(checkImageFile(webpLossy(1200, 800))).toMatchObject({ ok: true, width: 1200, height: 800 });
  });

  it('gives each file a short hash for its address', () => {
    const { hash } = checkImageFile(PNG_1X1);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(checkImageFile(png(2, 2)).hash).not.toBe(hash);
  });

  it('goes by the bytes, so nothing else gets in whatever it’s called', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = Buffer.from('<!doctype html><html><script>alert(1)</script></html>');
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
    for (const bytes of [svg, html, gif, Buffer.from('not an image at all')]) {
      expect(imageType(bytes)).toBeNull();
      expect(checkImageFile(bytes)).toEqual({ ok: false, error: 'Choose a JPEG, PNG or WebP photo.' });
    }
    expect(checkImageFile(Buffer.alloc(0)).ok).toBe(false);
    expect(checkImageFile('nope').ok).toBe(false);
  });

  it('refuses files too big in bytes or pixels, and ones whose size can’t be read', () => {
    const huge = Buffer.concat([png(10, 10), Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(checkImageFile(huge).error).toMatch(/too big/);
    expect(checkImageFile(png(4000, 300)).error).toMatch(/too large/);
    expect(checkImageFile(jpeg(300, 4000)).error).toMatch(/too large/);
    expect(checkImageFile(png(0, 10)).ok).toBe(false);
    // A JPEG that stops before its frame header.
    expect(checkImageFile(jpeg(100, 100).subarray(0, 24)).ok).toBe(false);
  });
});

describe('image addresses', () => {
  it('reads "<id>-<hash>" and nothing else', () => {
    expect(parseImageParam('12-0123456789abcdef')).toEqual({ id: 12, hash: '0123456789abcdef' });
    for (const value of ['12', '12-0123', '0-0123456789abcdef', '12-0123456789ABCDEF', '12-0123456789abcdef.png', '../1-0123456789abcdef', undefined]) {
      expect(parseImageParam(value)).toBeNull();
    }
  });

  it('are cached for good, as their address changes with the image', () => {
    expect(imageHeaders('image/webp', 1234)).toEqual({
      'Content-Type': 'image/webp',
      'Content-Length': '1234',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    });
  });
});
