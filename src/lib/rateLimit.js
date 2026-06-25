/**
 * Minimal in-memory rate limiter for a single-instance Node deployment.
 *
 * Hostinger Business shared hosting runs the app as one Node process with no
 * Redis/Memcached, so counters live in this module's memory. Each process
 * limits independently and state resets on restart — this is a deliberately
 * lightweight defense against password/invite-code brute force and abuse of the
 * public image proxy, not a distributed quota system.
 *
 * A sliding window is used: at most `limit` recorded hits per `windowMs`.
 */

// key -> { hits: number[] (ms timestamps, ascending), windowMs }
const buckets = new Map();

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/** Drop expired timestamps (and empty buckets) so the Map can't grow forever. */
function sweep(now) {
  for (const [key, bucket] of buckets) {
    const cutoff = now - bucket.windowMs;
    bucket.hits = bucket.hits.filter((t) => t > cutoff);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
  lastSweep = now;
}

function liveHits(bucket, now, windowMs) {
  if (!bucket) return [];
  const cutoff = now - windowMs;
  return bucket.hits.filter((t) => t > cutoff);
}

function retryAfterSeconds(hits, windowMs, now) {
  // The window frees up when its oldest in-window hit expires.
  return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
}

/**
 * Record a hit against `key` and report whether it's within the limit.
 * Returns `{ ok, remaining, retryAfterSeconds }`. When already at the limit the
 * hit is NOT recorded, so a sustained flood can't keep pushing the reset out.
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  if (now - lastSweep > SWEEP_INTERVAL_MS) sweep(now);

  const hits = liveHits(buckets.get(key), now, windowMs);

  if (hits.length >= limit) {
    buckets.set(key, { hits, windowMs });
    return { ok: false, remaining: 0, retryAfterSeconds: retryAfterSeconds(hits, windowMs, now) };
  }

  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

/**
 * Check whether `key` is currently rate-limited WITHOUT recording a hit. Use
 * when only certain outcomes should count toward the limit (e.g. failed logins:
 * peek with this on entry, then `rateLimit()` to record an actual failure).
 */
export function isRateLimited(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = liveHits(buckets.get(key), now, windowMs);
  if (hits.length >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: retryAfterSeconds(hits, windowMs, now) };
  }
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP from proxy headers. On Hostinger the app sits behind a
 * reverse proxy that sets `X-Forwarded-For`; we take the first (client) entry.
 * Falls back to a constant so a missing header degrades to one shared bucket
 * rather than throwing.
 */
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
