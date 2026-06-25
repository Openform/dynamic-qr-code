import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit, isRateLimited, getClientIp } from '../rateLimit';

// Each test uses a unique key so the module-level state can't leak between them.
let n = 0;
const freshKey = () => `test-key-${n++}`;

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to the limit then blocks', () => {
    const key = freshKey();
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit(key, opts).ok).toBe(true);
    expect(rateLimit(key, opts).ok).toBe(true);
    expect(rateLimit(key, opts).ok).toBe(true);
    const blocked = rateLimit(key, opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reports remaining count as it counts down', () => {
    const key = freshKey();
    const opts = { limit: 2, windowMs: 1000 };
    expect(rateLimit(key, opts).remaining).toBe(1);
    expect(rateLimit(key, opts).remaining).toBe(0);
  });

  it('frees up again once the window passes', () => {
    const key = freshKey();
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit(key, opts).ok).toBe(true);
    expect(rateLimit(key, opts).ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, opts).ok).toBe(true);
  });

  it('keeps separate keys independent', () => {
    const a = freshKey();
    const b = freshKey();
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit(a, opts).ok).toBe(true);
    expect(rateLimit(a, opts).ok).toBe(false);
    // b has its own budget.
    expect(rateLimit(b, opts).ok).toBe(true);
  });
});

describe('isRateLimited', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('peeks without consuming the budget', () => {
    const key = freshKey();
    const opts = { limit: 1, windowMs: 1000 };
    // Peeking many times does not record hits...
    expect(isRateLimited(key, opts).ok).toBe(true);
    expect(isRateLimited(key, opts).ok).toBe(true);
    // ...so the single real hit still succeeds.
    expect(rateLimit(key, opts).ok).toBe(true);
    // Now the budget is spent.
    expect(isRateLimited(key, opts).ok).toBe(false);
  });
});

describe('getClientIp', () => {
  const mk = (headers) => ({ headers: { get: (k) => headers[k] ?? null } });

  it('takes the first entry of X-Forwarded-For', () => {
    expect(getClientIp(mk({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' }))).toBe('203.0.113.5');
  });

  it('falls back to X-Real-IP then to "unknown"', () => {
    expect(getClientIp(mk({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(getClientIp(mk({}))).toBe('unknown');
  });
});
