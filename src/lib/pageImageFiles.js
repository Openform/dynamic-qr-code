/**
 * Checking an image uploaded for a campaign page (POST /api/pages/[id]/images).
 *
 * The browser resizes and re-saves every photo before it's sent (lib/
 * imageResize.js), which also drops hidden data such as where a phone photo
 * was taken. The server doesn't trust that: it reads the file's own first
 * bytes to see what it really is, accepts only JPEG, PNG and WebP (never SVG,
 * which can carry script, or anything else, whatever the upload claims to be),
 * reads its size in pixels from its header, and refuses files that are too
 * big. There's no image library on the server: the host can't run the native
 * ones, and nothing here needs to decode the picture.
 *
 * Server-only (uses Buffer and node:crypto).
 */

import { createHash } from 'node:crypto';

/** The most bytes an uploaded image may have (the browser aims for ~400 KB). */
export const MAX_IMAGE_BYTES = 1024 * 1024;

/** The widest or tallest an image may be, in pixels (the browser makes them 1600 at most). */
export const MAX_IMAGE_SIDE = 2400;

/** How many images one page can keep stored (it can show up to PAGE_LIMITS.images). */
export const MAX_STORED_IMAGES = 24;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the bytes are, from their signature: 'image/jpeg', 'image/png', 'image/webp', or null. */
export function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function pngSize(bytes) {
  // The IHDR chunk always comes first: width and height at bytes 16–23.
  if (bytes.length < 24 || bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  // Walk the segments to the first start-of-frame (SOF0–SOF15, except the
  // DHT, JPG and DAC markers that share the range).
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes) {
  const chunk = bytes.toString('latin1', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/**
 * Check an uploaded file's bytes. Returns `{ ok: true, mimeType, width,
 * height, hash }` (hash: 16 hex characters of its SHA-256, for its address),
 * or `{ ok: false, error }` with a message to show.
 */
export function checkImageFile(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return { ok: false, error: 'Choose a photo to upload.' };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'That photo is too big. Choose a smaller one (at most 1 MB once it’s been resized).' };
  }
  const mimeType = imageType(bytes);
  if (!mimeType) return { ok: false, error: 'Choose a JPEG, PNG or WebP photo.' };
  const size = mimeType === 'image/png' ? pngSize(bytes) : mimeType === 'image/jpeg' ? jpegSize(bytes) : webpSize(bytes);
  if (!size || size.width < 1 || size.height < 1) return { ok: false, error: 'That photo couldn’t be read. Try another one.' };
  if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
    return { ok: false, error: `That photo is too large. It can be at most ${MAX_IMAGE_SIDE} pixels wide or tall.` };
  }
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return { ok: true, mimeType, width: size.width, height: size.height, hash };
}

/** The image an address names ("12-0123456789abcdef"): `{ id, hash }`, or null. */
export function parseImageParam(value) {
  const match = /^([1-9][0-9]{0,9})-([0-9a-f]{16})$/.exec(String(value ?? ''));
  return match ? { id: Number(match[1]), hash: match[2] } : null;
}

/** Headers for sending an image: cached by the browser for good (its address changes with it). */
export function imageHeaders(mimeType, length) {
  return {
    'Content-Type': mimeType,
    'Content-Length': String(length),
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Disposition': 'inline',
  };
}
