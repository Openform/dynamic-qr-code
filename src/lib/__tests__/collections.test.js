import { describe, it, expect } from 'vitest';
import { validateCollectionName, MAX_NAME_LENGTH } from '../collections';

describe('validateCollectionName', () => {
  it('accepts a normal name and trims surrounding whitespace', () => {
    expect(validateCollectionName('  PPECB  ')).toEqual({ name: 'PPECB' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateCollectionName('')).toHaveProperty('error');
    expect(validateCollectionName('   ')).toHaveProperty('error');
  });

  it('rejects a non-string value', () => {
    expect(validateCollectionName(undefined)).toHaveProperty('error');
    expect(validateCollectionName(null)).toHaveProperty('error');
    expect(validateCollectionName(42)).toHaveProperty('error');
  });

  it('rejects names longer than the limit', () => {
    const tooLong = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateCollectionName(tooLong)).toHaveProperty('error');
    // Exactly the limit is allowed.
    const atLimit = 'a'.repeat(MAX_NAME_LENGTH);
    expect(validateCollectionName(atLimit)).toEqual({ name: atLimit });
  });

  it('reserves the built-in "Default" names (case-insensitive)', () => {
    expect(validateCollectionName('Default')).toHaveProperty('error');
    expect(validateCollectionName('default')).toHaveProperty('error');
    expect(validateCollectionName('  Default Collection  ')).toHaveProperty('error');
  });
});
