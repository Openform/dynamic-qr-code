import { describe, it, expect } from 'vitest';
import {
  normalizeDestinationUrl,
  isValidDestinationUrl,
  contrastRatio,
  evaluateContrast,
  effectiveErrorCorrectionLevel,
  buildQRStylingOptions,
  DEFAULT_STYLE,
  MIN_SCANNABLE_CONTRAST,
  GOOD_CONTRAST,
  PRESETS,
} from '../qrStyle';

describe('normalizeDestinationUrl', () => {
  it('prepends https:// when the scheme is omitted', () => {
    expect(normalizeDestinationUrl('example.com')).toBe('https://example.com');
    expect(normalizeDestinationUrl('example.com/path?q=1')).toBe(
      'https://example.com/path?q=1'
    );
    expect(normalizeDestinationUrl('example.com:8080')).toBe('https://example.com:8080');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeDestinationUrl('  example.com  ')).toBe('https://example.com');
  });

  it('leaves an existing scheme untouched', () => {
    expect(normalizeDestinationUrl('https://example.com')).toBe('https://example.com');
    // http is preserved here (validity is enforced by isValidDestinationUrl).
    expect(normalizeDestinationUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeDestinationUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  it('passes empty and non-string input through unchanged', () => {
    expect(normalizeDestinationUrl('')).toBe('');
    expect(normalizeDestinationUrl('   ')).toBe('');
    expect(normalizeDestinationUrl(undefined)).toBe(undefined);
    expect(normalizeDestinationUrl(null)).toBe(null);
  });
});

describe('isValidDestinationUrl', () => {
  it('accepts absolute https URLs', () => {
    expect(isValidDestinationUrl('https://example.com')).toBe(true);
    expect(isValidDestinationUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects http URLs', () => {
    expect(isValidDestinationUrl('http://example.com')).toBe(false);
  });

  it('rejects other schemes and malformed input', () => {
    expect(isValidDestinationUrl('ftp://example.com')).toBe(false);
    expect(isValidDestinationUrl('javascript:alert(1)')).toBe(false);
    expect(isValidDestinationUrl('example.com')).toBe(false); // not absolute
    expect(isValidDestinationUrl('')).toBe(false);
  });

  it('accepts scheme-less input once normalized', () => {
    expect(isValidDestinationUrl(normalizeDestinationUrl('example.com'))).toBe(true);
    expect(isValidDestinationUrl(normalizeDestinationUrl('http://example.com'))).toBe(false);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric and supports shorthand hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#000000'),
      5
    );
  });

  it('returns null when a color cannot be parsed as hex', () => {
    expect(contrastRatio('rebeccapurple', '#ffffff')).toBeNull();
    expect(contrastRatio('#000000', 'not-a-color')).toBeNull();
  });
});

describe('evaluateContrast', () => {
  it('passes a classic black-on-white code', () => {
    const r = evaluateContrast({ fgColor: '#000000', bgColor: '#ffffff' });
    expect(r.level).toBe('good');
    expect(r.scannable).toBe(true);
    expect(r.inverted).toBe(false);
    expect(r.ratio).toBeGreaterThanOrEqual(GOOD_CONTRAST);
  });

  it('blocks only near-indistinguishable colors', () => {
    const r = evaluateContrast({ fgColor: '#dddddd', bgColor: '#ffffff' });
    expect(r.ratio).toBeLessThan(MIN_SCANNABLE_CONTRAST);
    expect(r.level).toBe('fail');
    expect(r.scannable).toBe(false);
  });

  it('allows saturated bright colors that scan despite low WCAG luminance', () => {
    // Ocean preset's cyan reads ~1.8:1 on white but scans reliably.
    const r = evaluateContrast({ fgColor: '#00d4ff', bgColor: '#ffffff' });
    expect(r.scannable).toBe(true);
  });

  it('never blocks a shipped preset', () => {
    const blocked = PRESETS.filter((p) => !evaluateContrast(p.style).scannable).map((p) => p.name);
    expect(blocked).toEqual([]);
  });

  it('allows a mid-gray that scans on a phone (warn, not block)', () => {
    const r = evaluateContrast({ fgColor: '#999999', bgColor: '#ffffff' });
    expect(r.ratio).toBeGreaterThanOrEqual(MIN_SCANNABLE_CONTRAST);
    expect(r.ratio).toBeLessThan(GOOD_CONTRAST);
    expect(r.level).toBe('warn');
    expect(r.scannable).toBe(true);
  });

  it('flags inverted (light-on-dark) codes even at high contrast', () => {
    const r = evaluateContrast({ fgColor: '#ffffff', bgColor: '#000000' });
    expect(r.scannable).toBe(true);
    expect(r.inverted).toBe(true);
    expect(r.message).toMatch(/inverted/i);
  });

  it('catches a low-contrast gradient stop against the background', () => {
    const r = evaluateContrast({
      fgColor: '#000000',
      dotGradient: { type: 'linear', rotation: 0, color1: '#000000', color2: '#eeeeee' },
      bgColor: '#ffffff',
    });
    // The near-white gradient stop against a white background is the worst case.
    expect(r.scannable).toBe(false);
    expect(r.level).toBe('fail');
  });

  it('does not block a transparent background, advising instead', () => {
    const r = evaluateContrast({ fgColor: '#000000', bgTransparent: true });
    expect(r.level).toBe('unknown');
    expect(r.scannable).toBe(true);
    expect(r.ratio).toBeNull();
    expect(r.message).toMatch(/transparent/i);
  });
});

describe('effectiveErrorCorrectionLevel', () => {
  it('defaults to the minimal M level for logo-free codes', () => {
    expect(DEFAULT_STYLE.errorCorrectionLevel).toBe('M');
    expect(effectiveErrorCorrectionLevel({})).toBe('M');
    expect(effectiveErrorCorrectionLevel(undefined)).toBe('M');
  });

  it('respects the user-chosen level when there is no logo', () => {
    expect(effectiveErrorCorrectionLevel({ errorCorrectionLevel: 'L' })).toBe('L');
    expect(effectiveErrorCorrectionLevel({ errorCorrectionLevel: 'Q' })).toBe('Q');
  });

  it('forces H whenever a logo is set, overriding a lower chosen level', () => {
    expect(effectiveErrorCorrectionLevel({ logoUrl: 'https://x/logo.png' })).toBe('H');
    expect(
      effectiveErrorCorrectionLevel({ logoUrl: 'https://x/logo.png', errorCorrectionLevel: 'L' })
    ).toBe('H');
  });

  it('falls back to the default for an unknown level', () => {
    expect(effectiveErrorCorrectionLevel({ errorCorrectionLevel: 'Z' })).toBe('M');
  });

  it('is the level buildQRStylingOptions encodes with', () => {
    const minimal = buildQRStylingOptions({}, { data: 'https://example.com' });
    expect(minimal.qrOptions.errorCorrectionLevel).toBe('M');

    const withLogo = buildQRStylingOptions(
      { logoUrl: 'https://x/logo.png', errorCorrectionLevel: 'L' },
      { data: 'https://example.com' }
    );
    expect(withLogo.qrOptions.errorCorrectionLevel).toBe('H');
  });
});
