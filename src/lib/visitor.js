/**
 * Anonymous visitor IDs for counting unique scanners.
 *
 * The IP address is never stored. Instead, IP + user agent are hashed with a
 * server-side secret, so the same phone scanning twice gives the same ID, but
 * the ID can't be turned back into an IP (and can't be matched across sites,
 * since nobody else has the secret). Truncating to 64 bits keeps rows small;
 * collisions are negligible at this scale.
 */

import { createHmac } from 'node:crypto';

const HASH_LENGTH = 16; // hex chars, matches scan_events.visitor_hash

function analyticsSecret() {
  return process.env.ANALYTICS_SECRET || process.env.JWT_SECRET || null;
}

/**
 * HMAC-SHA256 of IP + user agent, as 16 hex chars. Returns null when the IP
 * is unknown (otherwise every such scan would look like one visitor) or when
 * no secret is configured.
 */
export function visitorHash(ip, userAgent, secret = analyticsSecret()) {
  if (!secret || typeof ip !== 'string' || ip === '' || ip === 'unknown') {
    return null;
  }
  return createHmac('sha256', secret)
    .update(`${ip}\n${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, HASH_LENGTH);
}
