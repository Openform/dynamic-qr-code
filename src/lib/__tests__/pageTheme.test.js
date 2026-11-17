import { describe, it, expect } from 'vitest';
import { pageLook, mix, readableBackground, THEME_FONTS } from '../pageTheme';
import { contrastRatio } from '../qrStyle';

// Brand colours across the whole range: dark, light, saturated and the
// mid-tones where neither white nor black text reads easily.
const BRANDS = [];
for (let r = 0; r < 256; r += 51) {
  for (let g = 0; g < 256; g += 51) {
    for (let b = 0; b < 256; b += 51) {
      BRANDS.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
    }
  }
}
BRANDS.push('#1F6F4A', '#F4B860', '#8A3B1F', '#2B59C3', '#777777', '#E06030', '#00D4FF');

const THEMES = ['fresh', 'night', 'bold'];

/** Text that must be readable, and what it sits on. */
const TEXT_PAIRS = [
  ['text', 'bg'],
  ['muted', 'bg'],
  ['text', 'surface'],
  ['offerInk', 'offerBg'],
  ['offerMuted', 'offerBg'],
  ['offerLabel', 'offerBg'],
  ['btn2Ink', 'btn2Bg'],
];

describe('pageLook', () => {
  it('keeps text readable (4.5:1) on every theme with any brand colour', () => {
    const failures = [];
    for (const theme of THEMES) {
      for (const brand of BRANDS) {
        const { colors } = pageLook({ theme, brand });
        for (const [ink, on] of TEXT_PAIRS) {
          // A transparent background shows the page behind it.
          const background = colors[on] === 'transparent' ? colors.bg : colors[on];
          const ratio = contrastRatio(colors[ink], background);
          if (ratio < 4.5) failures.push(`${theme} ${brand}: ${ink} on ${on} is ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps button text readable (4.5:1) on every theme with any brand colour', () => {
    const failures = [];
    for (const theme of THEMES) {
      for (const brand of BRANDS) {
        const { colors } = pageLook({ theme, brand });
        const ratio = contrastRatio(colors.btnInk, colors.btnBg);
        if (ratio < 4.5) failures.push(`${theme} ${brand}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('only changes the brand colour when text can’t read on it', () => {
    // Text reads on these as they are, so they're used exactly.
    expect(pageLook({ theme: 'fresh', brand: '#1F6F4A' }).colors.btnBg).toBe('#1F6F4A');
    expect(pageLook({ theme: 'bold', brand: '#8A3B1F' }).colors.bg).toBe('#8A3B1F');
    // #777777 can't reach 4.5:1 with white or black, so it's deepened just
    // enough for the page's light text.
    expect(readableBackground('#777777', '#FFFFFF')).toBe('#727272');
    const { colors } = pageLook({ theme: 'bold', brand: '#777777' });
    expect(colors.bg).not.toBe('#777777');
    expect(contrastRatio(colors.text, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('switches button text with the brand colour', () => {
    expect(pageLook({ theme: 'fresh', brand: '#1F6F4A' }).colors.btnInk).toBe('#FFFFFF');
    expect(pageLook({ theme: 'fresh', brand: '#F4B860' }).colors.btnInk).toBe('#141414');
    expect(pageLook({ theme: 'bold', brand: '#8A3B1F' }).colors.text).toBe('#FFF6EC');
    expect(pageLook({ theme: 'bold', brand: '#F4B860' }).colors.text).toBe('#1A1410');
  });

  it('uses the theme’s font unless the page picks one', () => {
    expect(pageLook({ theme: 'night', brand: '#F4B860' }).font).toBe(THEME_FONTS.night);
    expect(pageLook({ theme: 'night', brand: '#F4B860', font: 'fraunces' }).font).toBe('fraunces');
    expect(pageLook({ theme: 'night', brand: '#F4B860', font: 'comic-sans' }).font).toBe('space-grotesk');
  });

  it('falls back to the defaults for an unknown theme or colour', () => {
    const look = pageLook({ theme: 'neon', brand: 'red' });
    expect(look.theme).toBe('fresh');
    expect(look.brand).toBe('#1F6F4A');
    expect(pageLook(null).theme).toBe('fresh');
  });

  it('sets every colour as a CSS custom property', () => {
    const { style } = pageLook({ theme: 'bold', brand: '#2B59C3' });
    expect(style['--cp-bg']).toBe('#2B59C3');
    expect(Object.keys(style).every((key) => key.startsWith('--cp-'))).toBe(true);
    expect(Object.values(style).every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#1F6F4A', '#FFFFFF', 0)).toBe('#1F6F4A');
    expect(mix('#1F6F4A', '#FFFFFF', 1)).toBe('#FFFFFF');
  });
});
