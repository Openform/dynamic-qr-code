import { describe, it, expect } from 'vitest';
import { validateNewAccount } from '../accounts';

const valid = { email: 'client@example.com', password: 'secret123', name: 'Acme' };

describe('validateNewAccount', () => {
  it('accepts valid fields and trims the name and email', () => {
    expect(
      validateNewAccount({ email: '  client@example.com ', password: 'secret123', name: '  Acme  ' })
    ).toEqual({ email: 'client@example.com', password: 'secret123', name: 'Acme' });
  });

  it('requires email, password and name', () => {
    expect(validateNewAccount({ ...valid, email: '' })).toHaveProperty('error');
    expect(validateNewAccount({ ...valid, password: '' })).toHaveProperty('error');
    expect(validateNewAccount({ ...valid, name: '' })).toHaveProperty('error');
    expect(validateNewAccount({ ...valid, name: '   ' })).toHaveProperty('error');
    expect(validateNewAccount()).toHaveProperty('error');
  });

  it('rejects an invalid email', () => {
    expect(validateNewAccount({ ...valid, email: 'not-an-email' })).toEqual({
      error: 'Invalid email address',
    });
    expect(validateNewAccount({ ...valid, email: 42 })).toHaveProperty('error');
  });

  it('rejects a short password', () => {
    expect(validateNewAccount({ ...valid, password: '12345' })).toEqual({
      error: 'Password must be at least 6 characters',
    });
  });

  it('rejects an overly long name', () => {
    expect(validateNewAccount({ ...valid, name: 'a'.repeat(256) })).toHaveProperty('error');
  });
});
