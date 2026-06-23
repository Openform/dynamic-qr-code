import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { verifyInviteCode } from '../auth';

describe('verifyInviteCode', () => {
  let originalCode;

  beforeEach(() => {
    originalCode = process.env.SIGNUP_INVITE_CODE;
  });

  afterEach(() => {
    if (originalCode === undefined) {
      delete process.env.SIGNUP_INVITE_CODE;
    } else {
      process.env.SIGNUP_INVITE_CODE = originalCode;
    }
  });

  it('returns true when provided code matches environment variable', () => {
    process.env.SIGNUP_INVITE_CODE = 'my-secret-code';
    expect(verifyInviteCode('my-secret-code')).toBe(true);
  });

  it('returns false when provided code does not match', () => {
    process.env.SIGNUP_INVITE_CODE = 'my-secret-code';
    expect(verifyInviteCode('wrong-code')).toBe(false);
  });

  it('returns false when provided code has different length', () => {
    process.env.SIGNUP_INVITE_CODE = 'my-secret-code';
    expect(verifyInviteCode('my-secret-code-extra')).toBe(false);
  });

  it('returns false when environment variable is not set', () => {
    delete process.env.SIGNUP_INVITE_CODE;
    expect(verifyInviteCode('any-code')).toBe(false);
  });

  it('returns false when environment variable is empty', () => {
    process.env.SIGNUP_INVITE_CODE = '';
    expect(verifyInviteCode('any-code')).toBe(false);
  });

  it('returns false when provided code is empty', () => {
    process.env.SIGNUP_INVITE_CODE = 'secret';
    expect(verifyInviteCode('')).toBe(false);
  });

  it('returns false when provided code is not a string', () => {
    process.env.SIGNUP_INVITE_CODE = 'secret';
    expect(verifyInviteCode(null)).toBe(false);
    expect(verifyInviteCode(undefined)).toBe(false);
    expect(verifyInviteCode(123)).toBe(false);
    expect(verifyInviteCode({})).toBe(false);
  });
});
