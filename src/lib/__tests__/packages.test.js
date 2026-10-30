import { describe, it, expect } from 'vitest';
import {
  PACKAGES,
  DEFAULT_PACKAGE,
  isValidPackage,
  getPackage,
  hasReachedLimit,
  describeLimit,
  describePrice,
  formatRand,
} from '../packages';

describe('packages', () => {
  it('defines the four packages with their code limits', () => {
    expect(PACKAGES.map((p) => [p.id, p.limit])).toEqual([
      ['starter', 5],
      ['business', 20],
      ['extended', 50],
      ['enterprise', null],
    ]);
  });

  it('defaults new sign-ups to Starter', () => {
    expect(DEFAULT_PACKAGE).toBe('starter');
  });

  it('only accepts known package ids', () => {
    expect(isValidPackage('business')).toBe(true);
    expect(isValidPackage('Business')).toBe(false);
    expect(isValidPackage('gold')).toBe(false);
    expect(isValidPackage(undefined)).toBe(false);
    expect(isValidPackage(null)).toBe(false);
  });

  it('falls back to the default package for unknown ids, never to unlimited', () => {
    expect(getPackage('enterprise').limit).toBeNull();
    expect(getPackage('nonsense').id).toBe('starter');
    expect(getPackage(undefined).id).toBe('starter');
  });
});

describe('hasReachedLimit', () => {
  it('blocks at and above the limit', () => {
    expect(hasReachedLimit('starter', 4)).toBe(false);
    expect(hasReachedLimit('starter', 5)).toBe(true);
    expect(hasReachedLimit('starter', 9)).toBe(true);
    expect(hasReachedLimit('business', 19)).toBe(false);
    expect(hasReachedLimit('business', 20)).toBe(true);
    expect(hasReachedLimit('extended', 50)).toBe(true);
  });

  it('never blocks Enterprise', () => {
    expect(hasReachedLimit('enterprise', 0)).toBe(false);
    expect(hasReachedLimit('enterprise', 10_000)).toBe(false);
  });
});

describe('describeLimit', () => {
  it('describes limited and unlimited packages', () => {
    expect(describeLimit('starter')).toBe('5 codes');
    expect(describeLimit('enterprise')).toBe('Unlimited codes');
  });
});

describe('prices', () => {
  it('formats rands with a thousands separator', () => {
    expect(formatRand(1500)).toBe('R1,500');
    expect(formatRand(500)).toBe('R500');
    expect(formatRand(12000)).toBe('R12,000');
  });

  it('describes yearly and custom prices', () => {
    expect(describePrice('starter')).toBe('R1,500/year');
    expect(describePrice('business')).toBe('R3,000/year');
    expect(describePrice('extended')).toBe('R5,000/year');
    expect(describePrice('enterprise')).toBe('Custom pricing');
  });
});
