/**
 * Fonts and text sizes on campaign pages: what lib/campaignPages.js accepts,
 * what lib/pageTheme.js sets for them, and that every font is self-hosted:
 * its file and licence are in src/app/fonts and the campaign fonts module
 * loads it, so no page ever needs a font service.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BODY_FONTS, FONTS, HEADING_SIZES, TEXT_SIZES, parsePageContent } from '../campaignPages';
import { fontStack, pageLook } from '../pageTheme';

const ROOT = join(__dirname, '..', '..', '..');
const header = { id: 'header', type: 'header', cover: null, logo: null, title: 'Bean There', tagline: '' };
const page = (fields = {}) => ({ theme: 'fresh', brand: '#1F6F4A', font: null, blocks: [header], ...fields });

describe('choosing fonts and sizes', () => {
  it('keeps the chosen fonts and sizes', () => {
    const checked = parsePageContent(page({ font: 'playfair-display', bodyFont: 'lora', textSize: 'large', headingSize: 'larger' }));
    expect(checked.content).toMatchObject({ font: 'playfair-display', bodyFont: 'lora', textSize: 'large', headingSize: 'larger' });
  });

  it('gives pages saved before these settings the defaults', () => {
    expect(parsePageContent(page()).content).toMatchObject({ font: null, bodyFont: null, textSize: 'standard', headingSize: 'standard' });
  });

  it('lets any font be the headings’, but only readable ones be the text’s', () => {
    for (const font of FONTS) expect(parsePageContent(page({ font: font.id })).ok, font.id).toBe(true);
    for (const font of ['oswald', 'caveat', 'playfair-display', 'fraunces']) {
      expect(parsePageContent(page({ bodyFont: font }))).toMatchObject({ ok: false, path: 'bodyFont' });
    }
    expect(BODY_FONTS.map((font) => font.id)).toEqual(['inter', 'outfit', 'nunito', 'space-grotesk', 'lora']);
  });

  it('only takes the size steps on offer', () => {
    expect(parsePageContent(page({ textSize: '42px' }))).toMatchObject({ ok: false, path: 'textSize' });
    expect(parsePageContent(page({ headingSize: 'huge' }))).toMatchObject({ ok: false, path: 'headingSize' });
    // Text never gets smaller than the visitor's own setting.
    expect(Math.min(...TEXT_SIZES.map((size) => size.scale))).toBe(1);
  });
});

describe('pageLook fonts and sizes', () => {
  it('sets the text’s font, Inter by default', () => {
    expect(pageLook(page()).style['--cp-body-font']).toBe(fontStack('inter'));
    expect(pageLook(page({ bodyFont: 'nunito' })).style['--cp-body-font']).toMatch(/^var\(--font-nunito\)/);
    // A font that isn't for text falls back to Inter rather than being used.
    expect(pageLook(page({ bodyFont: 'caveat' })).style['--cp-body-font']).toBe(fontStack('inter'));
  });

  it('scales text, and headings with it', () => {
    expect(pageLook(page()).style).toMatchObject({ '--cp-text-scale': '1', '--cp-head-scale': '1' });
    expect(pageLook(page({ textSize: 'larger', headingSize: 'smaller' })).style).toMatchObject({ '--cp-text-scale': '1.25', '--cp-head-scale': '1.063' });
    expect(pageLook(page({ textSize: 'nope' })).style['--cp-text-scale']).toBe('1');
  });

  it('tunes headings for fonts that need it', () => {
    const caveat = pageLook(page({ font: 'caveat' })).style;
    expect(caveat).toMatchObject({ '--cp-head-weight': '700', '--cp-head-tracking': '0', '--cp-head-scale': '1.25' });
    expect(pageLook(page({ font: 'oswald' })).style['--cp-head-tracking']).toBe('0.01em');
    // Other fonts keep the theme's own.
    expect(pageLook(page({ font: 'outfit' })).style['--cp-head-tracking']).toBe(pageLook(page()).style['--cp-head-tracking']);
  });
});

describe('the fonts themselves', () => {
  const fontsModule = readFileSync(join(ROOT, 'src/app/components/campaign/fonts.js'), 'utf8');
  const layout = readFileSync(join(ROOT, 'src/app/layout.js'), 'utf8');

  it('are all loaded from files in the app, with their licences', () => {
    for (const font of FONTS) {
      const variable = /^var\((--font-[a-z-]+)\)/.exec(fontStack(font.id))?.[1];
      expect(variable, font.id).toBeTruthy();
      const loader = font.id === 'inter' ? layout : fontsModule;
      expect(loader, `${font.id} sets ${variable}`).toContain(`variable: "${variable}"`);
    }
    const files = [...fontsModule.matchAll(/src: "\.\.\/\.\.\/fonts\/([\w-]+\.woff2)"/g)].map((m) => m[1]);
    expect(files).toHaveLength(FONTS.length - 1);
    for (const file of files) {
      expect(existsSync(join(ROOT, 'src/app/fonts', file)), file).toBe(true);
      const licence = `LICENSE-${file.replace('Variable.woff2', '')}.txt`;
      expect(readFileSync(join(ROOT, 'src/app/fonts', licence), 'utf8'), licence).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    }
  });

  it('never come from a font service', () => {
    expect(fontsModule).not.toMatch(/next\/font\/google|https?:\/\//);
    expect(layout).not.toMatch(/next\/font\/google|fonts\.googleapis|fonts\.gstatic/);
    expect(HEADING_SIZES.length).toBeGreaterThan(0);
  });
});
