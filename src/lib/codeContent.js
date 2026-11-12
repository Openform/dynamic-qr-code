/**
 * Server-side handling of a code's content (see lib/contentTypes.js).
 *
 * Static codes (Wi-Fi) keep their content in `qrcodes.content_data`,
 * encrypted with AES-256-GCM, because it includes a network password. The
 * database, its backups and phpMyAdmin only ever see ciphertext. It's
 * decrypted only to send to the code's own signed-in owner, whose dashboard
 * needs it to draw and download the code. It's never in the destination,
 * scan records, analytics or exports.
 *
 * The key is derived from CONTENT_SECRET (or JWT_SECRET when that's not set).
 * Each value is sealed with its code's short ID as associated data, so a
 * value copied onto another code's row won't open.
 *
 * Changing the secret makes the saved Wi-Fi details unreadable. Printed codes
 * keep working (scanning them never reaches QR Go), but the dashboard can't
 * draw or download them again: the owner has to create the code again.
 *
 * Uses node:crypto, so only server code may import this file.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { contentFromDestination, getContentType, isStaticType } from './contentTypes';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_INFO = 'qrgo code content v1';
const KEY_SALT = 'qrgo/code-content';

function contentSecret() {
  return process.env.CONTENT_SECRET || process.env.JWT_SECRET || null;
}

function deriveKey(secret) {
  return Buffer.from(hkdfSync('sha256', secret, KEY_SALT, KEY_INFO, 32));
}

function aad(shortId) {
  return Buffer.from(`qrcode:${shortId}`, 'utf8');
}

/**
 * Encrypt a static code's content for storage, as
 * "v1.<iv>.<tag>.<ciphertext>" (base64url). Throws when no secret is set,
 * so content is never stored unencrypted.
 */
export function sealContent(content, shortId, secret = contentSecret()) {
  if (!secret) throw new Error('CONTENT_SECRET (or JWT_SECRET) must be set to store code content');
  if (!shortId) throw new Error('A short ID is needed to seal code content');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(shortId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(content), 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/**
 * Decrypt content sealed by sealContent(). Returns the object, or null when
 * it's missing, damaged, sealed for another code, or sealed with another
 * secret.
 */
export function openContent(sealed, shortId, secret = contentSecret()) {
  if (typeof sealed !== 'string' || !secret || !shortId) return null;
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [iv, tag, ciphertext] = parts.slice(1).map((p) => Buffer.from(p, 'base64url'));
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(shortId));
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const content = JSON.parse(json);
    return content && typeof content === 'object' ? content : null;
  } catch {
    return null;
  }
}

/**
 * The content fields to send the owner for one code:
 *   - website codes: `{ url }`, as stored
 *   - other redirect and action types: read back from the destination
 *   - static types: decrypted from content_data
 * Returns null when they can't be read (then the dashboard says so).
 */
export function clientContent({ contentType, destinationUrl, contentData, shortId }) {
  const type = getContentType(contentType);
  if (isStaticType(type.id)) return openContent(contentData, shortId);
  if (type.id === 'url') return { url: destinationUrl ?? '' };
  return contentFromDestination(type.id, destinationUrl);
}
