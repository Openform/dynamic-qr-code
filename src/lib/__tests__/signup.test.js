import { describe, it, expect } from 'vitest';
import { getSignupCta } from '../signup';

describe('getSignupCta', () => {
  it('goes to the sign-up page when no invite link is set', () => {
    expect(getSignupCta({})).toEqual({
      href: '/register',
      label: 'Create an account',
      external: false,
    });
  });

  it('asks for an invite at an email address', () => {
    expect(getSignupCta({ INVITE_REQUEST_URL: ' mailto:hello@example.com ' })).toEqual({
      href: 'mailto:hello@example.com',
      label: 'Request an invite',
      external: true,
    });
  });

  it('asks for an invite on a secure web form', () => {
    expect(getSignupCta({ INVITE_REQUEST_URL: 'https://forms.example.com/invite' }).href).toBe(
      'https://forms.example.com/invite',
    );
  });

  it('ignores links that are not https or mailto', () => {
    for (const url of ['javascript:alert(1)', 'http://example.com', 'example.com', '']) {
      expect(getSignupCta({ INVITE_REQUEST_URL: url }).href).toBe('/register');
    }
  });
});
