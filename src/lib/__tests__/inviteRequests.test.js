import { describe, it, expect } from 'vitest';
import {
  validateInviteRequest,
  isLikelyBot,
  toClientInviteRequest,
  HONEYPOT_FIELD,
  INVITE_FIELD_LIMITS,
} from '../inviteRequests.js';

const valid = { name: 'Jane Smith', email: 'jane@acme.co.za' };

describe('validateInviteRequest', () => {
  it('accepts name and email alone, with empty optional fields as null', () => {
    expect(validateInviteRequest(valid)).toEqual({
      name: 'Jane Smith',
      email: 'jane@acme.co.za',
      company: null,
      phone: null,
      package: null,
    });
  });

  it('keeps every field when filled in', () => {
    expect(
      validateInviteRequest({
        ...valid,
        company: 'Acme Ltd',
        phone: '+27 (82) 123-4567',
        package: 'business',
      })
    ).toEqual({
      name: 'Jane Smith',
      email: 'jane@acme.co.za',
      company: 'Acme Ltd',
      phone: '+27 (82) 123-4567',
      package: 'business',
    });
  });

  it('trims fields and folds line breaks and control characters into one line', () => {
    const result = validateInviteRequest({
      name: '  Jane\r\nBcc: someone@example.com ',
      email: ' jane@acme.co.za ',
      company: 'Acme\u0000\tLtd',
    });
    expect(result.name).toBe('Jane Bcc: someone@example.com');
    expect(result.email).toBe('jane@acme.co.za');
    expect(result.company).toBe('Acme Ltd');
  });

  it('requires a name and an email', () => {
    expect(validateInviteRequest({ email: valid.email }).error).toMatch(/name/);
    expect(validateInviteRequest({ name: '   ', email: valid.email }).error).toMatch(/name/);
    expect(validateInviteRequest({ name: valid.name }).error).toMatch(/email/);
    expect(validateInviteRequest(undefined).error).toBeTruthy();
    expect(validateInviteRequest({ name: 42, email: ['a@b.co'] }).error).toBeTruthy();
  });

  it('rejects email addresses that are invalid or unsafe in an email header', () => {
    for (const email of [
      'jane',
      'jane@acme',
      'jane@@acme.com',
      'jane smith@acme.com',
      'Jane <jane@acme.com>',
      'jane@acme.com, eve@evil.com',
      'jane@acme.com;eve@evil.com',
      '"jane"@acme.com',
      'jane@acme.c',
    ]) {
      expect(validateInviteRequest({ ...valid, email }).error, email).toMatch(/valid email/);
    }
  });

  it('rejects values over the length limits', () => {
    const long = (n) => 'a'.repeat(n);
    expect(validateInviteRequest({ ...valid, name: long(INVITE_FIELD_LIMITS.name + 1) }).error).toMatch(/too long/);
    expect(validateInviteRequest({ ...valid, company: long(INVITE_FIELD_LIMITS.company + 1) }).error).toMatch(/too long/);
    expect(
      validateInviteRequest({ ...valid, email: `${long(INVITE_FIELD_LIMITS.email)}@acme.com` }).error
    ).toMatch(/valid email/);
  });

  it('checks phone numbers but allows leaving them blank', () => {
    expect(validateInviteRequest({ ...valid, phone: '' }).phone).toBeNull();
    expect(validateInviteRequest({ ...valid, phone: '082 123 4567' }).phone).toBe('082 123 4567');
    for (const phone of ['12345', 'call me', '+27 82 123 4567 ext 9', '1'.repeat(16)]) {
      expect(validateInviteRequest({ ...valid, phone }).error, phone).toMatch(/phone/);
    }
  });

  it('only accepts known plans', () => {
    expect(validateInviteRequest({ ...valid, package: '' }).package).toBeNull();
    expect(validateInviteRequest({ ...valid, package: 'enterprise' }).package).toBe('enterprise');
    expect(validateInviteRequest({ ...valid, package: 'platinum' }).error).toMatch(/plan/);
  });
});

describe('isLikelyBot', () => {
  it('is true only when the hidden field has something in it', () => {
    expect(isLikelyBot(valid)).toBe(false);
    expect(isLikelyBot({ ...valid, [HONEYPOT_FIELD]: '' })).toBe(false);
    expect(isLikelyBot({ ...valid, [HONEYPOT_FIELD]: '  ' })).toBe(false);
    expect(isLikelyBot({ ...valid, [HONEYPOT_FIELD]: 'https://spam.example' })).toBe(true);
    expect(isLikelyBot(null)).toBe(false);
  });
});

describe('toClientInviteRequest', () => {
  it('turns stored UTC times into ISO strings and flags existing accounts', () => {
    expect(
      toClientInviteRequest({
        id: 7,
        name: 'Jane Smith',
        email: 'jane@acme.co.za',
        company: null,
        phone: '082 123 4567',
        package: 'starter',
        created_at: '2026-10-29 09:15:00',
        handled_at: null,
        handled_by_name: null,
        has_account: 1,
      })
    ).toEqual({
      id: 7,
      name: 'Jane Smith',
      email: 'jane@acme.co.za',
      company: null,
      phone: '082 123 4567',
      package: 'starter',
      createdAt: '2026-10-29T09:15:00Z',
      handledAt: null,
      handledByName: null,
      hasAccount: true,
    });
  });

  it('includes who marked it done', () => {
    const client = toClientInviteRequest({
      id: 8,
      name: 'Sam',
      email: 'sam@example.com',
      created_at: '2026-10-28 08:00:00',
      handled_at: '2026-10-28 10:30:00',
      handled_by_name: 'Kenton',
      has_account: 0,
    });
    expect(client.handledAt).toBe('2026-10-28T10:30:00Z');
    expect(client.handledByName).toBe('Kenton');
    expect(client.hasAccount).toBe(false);
  });
});
