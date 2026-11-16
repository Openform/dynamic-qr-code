/**
 * The colours, fonts and shapes of a campaign page, worked out from its theme,
 * brand colour and font (lib/campaignPages.js). The page component applies
 * them as CSS custom properties (--cp-…), so one stylesheet draws every theme.
 *
 * Text is kept readable whatever brand colour is chosen: words on the brand
 * colour (buttons, a Bold page's background) switch between light and dark,
 * and any colour that would fall below 4.5:1 (the WCAG level for normal
 * text) against what it sits on falls back to one that doesn't.
 *
 * Shared by the public page and the editor's preview, so this file must stay
 * free of server-only imports.
 */

import { contrastRatio } from './qrStyle';
import { pickTextColor, DEFAULT_BRAND } from './campaignPages';

const WHITE = '#FFFFFF';
const BLACK = '#000000';
const CREAM = '#FFF6EC';
const INK = '#16191D';

/** Each theme's own heading font, used when the page doesn't choose one. */
export const THEME_FONTS = { fresh: 'inter', night: 'space-grotesk', bold: 'fraunces' };

// The CSS variables next/font sets for each font (see the campaign fonts
// module), with fallbacks for while a font loads.
const FONT_STACKS = {
  inter: 'var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif',
  'space-grotesk': 'var(--font-space-grotesk), var(--font-inter), system-ui, sans-serif',
  fraunces: 'var(--font-fraunces), Georgia, "Times New Roman", serif',
};

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` moved a fraction `t` of the way towards `b` (both #RRGGBB). */
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x
    .map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function luminanceOf(hex) {
  // contrastRatio against black is (L + 0.05) / 0.05, so L comes straight back out.
  return contrastRatio(hex, BLACK) * 0.05 - 0.05;
}

/** `color` when it reads well on `background` (4.5:1), else `fallback`. */
function readable(color, background, fallback) {
  return contrastRatio(color, background) >= 4.5 ? color : fallback;
}

/**
 * `background` as it is when `ink` reads well on it (4.5:1), otherwise
 * darkened or lightened just enough that it does. Some mid-tone colours
 * (#777777, say) can't reach 4.5:1 with white or black text, so a button or
 * a Bold page on them uses a slightly deeper or paler shade of the brand.
 */
export function readableBackground(background, ink) {
  if (contrastRatio(ink, background) >= 4.5) return background;
  const toward = luminanceOf(ink) > luminanceOf(background) ? BLACK : WHITE;
  for (let step = 1; step <= 25; step += 1) {
    const shade = mix(background, toward, step * 0.04);
    if (contrastRatio(ink, shade) >= 4.5) return shade;
  }
  return toward;
}

function freshTokens(brand) {
  const ink = pickTextColor(brand);
  const button = readableBackground(brand, ink);
  const tint = mix(brand, WHITE, 0.9);
  const cover = mix(brand, WHITE, 0.8);
  const muted = '#5B6168';
  return {
    bg: WHITE,
    text: INK,
    muted,
    surface: '#F5F7F6',
    surfaceBorder: '1px solid #E3E7E5',
    divider: '#E3E7E5',
    cover,
    coverInk: readable(mix(brand, BLACK, 0.35), cover, INK),
    logoBg: brand,
    logoInk: ink,
    headWeight: 700,
    headTracking: '-0.02em',
    radius: '14px',
    btnRadius: '999px',
    btnBg: button,
    btnInk: ink,
    btnBorder: `1px solid ${button}`,
    btn2Bg: WHITE,
    btn2Ink: INK,
    btn2Border: '1.5px solid #CFD6D2',
    offerBg: tint,
    offerInk: INK,
    offerLabel: readable(brand, tint, INK),
    offerMuted: '#4A5057',
    offerBorder: `1px solid ${mix(brand, WHITE, 0.75)}`,
    codeBorder: readable(brand, tint, muted),
    accent: readable(brand, WHITE, INK),
  };
}

function nightTokens(brand) {
  const bg = '#111418';
  const surface = '#1B2027';
  const line = '#2A313A';
  const text = '#F2F2EF';
  const ink = pickTextColor(brand, { dark: bg });
  const button = readableBackground(brand, ink);
  const accent = readable(brand, surface, text);
  return {
    bg,
    text,
    muted: '#A9B0B8',
    surface,
    surfaceBorder: `1px solid ${line}`,
    divider: line,
    cover: '#232A33',
    coverInk: '#B9C0C8',
    logoBg: brand,
    logoInk: ink,
    headWeight: 700,
    headTracking: '-0.01em',
    radius: '16px',
    btnRadius: '12px',
    btnBg: button,
    btnInk: ink,
    btnBorder: `1px solid ${button}`,
    btn2Bg: surface,
    btn2Ink: text,
    btn2Border: `1px solid ${line}`,
    offerBg: surface,
    offerInk: text,
    offerLabel: accent,
    offerMuted: '#A9B0B8',
    offerBorder: `1px solid ${mix(brand, surface, 0.45)}`,
    codeBorder: accent,
    accent,
  };
}

function boldTokens(brand) {
  const text = pickTextColor(brand, { light: CREAM, dark: '#1A1410' });
  const bg = readableBackground(brand, text);
  // Panels and the cover move away from the text colour, so text on them
  // reads at least as well as it does on the background.
  const lightText = text === CREAM;
  const surface = lightText ? mix(bg, BLACK, 0.22) : mix(bg, WHITE, 0.4);
  const cover = lightText ? mix(bg, BLACK, 0.32) : mix(bg, BLACK, 0.12);
  const muted = readable(mix(text, bg, 0.14), bg, text);
  return {
    bg,
    text,
    muted,
    surface,
    surfaceBorder: `1px solid ${surface}`,
    divider: mix(surface, text, 0.22),
    cover,
    coverInk: pickTextColor(cover, { light: CREAM, dark: '#1A1410' }),
    logoBg: text,
    logoInk: bg,
    headWeight: 600,
    headTracking: '-0.01em',
    radius: '6px',
    btnRadius: '6px',
    btnBg: text,
    btnInk: bg,
    btnBorder: `1px solid ${text}`,
    btn2Bg: 'transparent',
    btn2Ink: text,
    btn2Border: `1.5px solid ${text}`,
    offerBg: surface,
    offerInk: text,
    offerLabel: text,
    offerMuted: readable(mix(text, surface, 0.12), surface, text),
    offerBorder: `1px solid ${surface}`,
    codeBorder: muted,
    accent: text,
  };
}

const THEME_TOKENS = { fresh: freshTokens, night: nightTokens, bold: boldTokens };

/**
 * The look of a page with this content: `{ theme, colors, style }`, where
 * `colors` holds the named colours (for tests and the browser's theme
 * colour) and `style` is the CSS custom properties to put on the page's
 * root element. An unknown theme or colour falls back to the defaults.
 */
export function pageLook(content) {
  const theme = THEME_TOKENS[content?.theme] ? content.theme : 'fresh';
  const brand = /^#[0-9A-Fa-f]{6}$/.test(content?.brand ?? '') ? content.brand.toUpperCase() : DEFAULT_BRAND;
  const font = FONT_STACKS[content?.font] ? content.font : THEME_FONTS[theme];
  const t = THEME_TOKENS[theme](brand);

  const style = {
    '--cp-bg': t.bg,
    '--cp-text': t.text,
    '--cp-muted': t.muted,
    '--cp-surface': t.surface,
    '--cp-surface-border': t.surfaceBorder,
    '--cp-divider': t.divider,
    '--cp-cover': t.cover,
    '--cp-cover-ink': t.coverInk,
    '--cp-logo-bg': t.logoBg,
    '--cp-logo-ink': t.logoInk,
    '--cp-head-font': FONT_STACKS[font],
    '--cp-body-font': FONT_STACKS.inter,
    '--cp-head-weight': String(t.headWeight),
    '--cp-head-tracking': t.headTracking,
    '--cp-radius': t.radius,
    '--cp-btn-radius': t.btnRadius,
    '--cp-btn-bg': t.btnBg,
    '--cp-btn-ink': t.btnInk,
    '--cp-btn-border': t.btnBorder,
    '--cp-btn2-bg': t.btn2Bg,
    '--cp-btn2-ink': t.btn2Ink,
    '--cp-btn2-border': t.btn2Border,
    '--cp-offer-bg': t.offerBg,
    '--cp-offer-ink': t.offerInk,
    '--cp-offer-label': t.offerLabel,
    '--cp-offer-muted': t.offerMuted,
    '--cp-offer-border': t.offerBorder,
    '--cp-code-border': t.codeBorder,
    '--cp-accent': t.accent,
  };
  return { theme, brand, font, colors: t, style, dark: luminanceOf(t.bg) < 0.2 };
}
