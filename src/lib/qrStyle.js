/**
 * Shared, client-safe helpers for QR / barcode visual styling.
 *
 * This is the single source of truth that turns our stored style config into
 * `qr-code-styling` options (for QR) or `bwip-js` options (Data Matrix).
 * It is imported by the dashboard components (live preview + download) AND by the
 * API routes (to sanitize untrusted input before persisting), so it must stay
 * framework-agnostic: pure functions, no React and no rendering-library imports.
 */

// ── Allowed values (mirror qr-code-styling's supported types) ──
export const DOT_STYLES = ['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded'];
export const CORNER_SQUARE_STYLES = ['square', 'dot', 'extra-rounded'];
export const CORNER_DOT_STYLES = ['square', 'dot'];
export const GRADIENT_TYPES = ['linear', 'radial'];
export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'];
export const QR_SHAPES = ['square', 'circle'];

/**
 * Supported barcode symbologies. Only 'qr' uses qr-code-styling (with the full
 * gradient/shape/logo styling); the others render via bwip-js (color + size
 * only). `bcid` is the bwip-js symbology id.
 */
export const CODE_TYPES = [
  { id: 'qr', label: 'QR Code', bcid: 'qrcode' },
  { id: 'datamatrix', label: 'Data Matrix', bcid: 'datamatrix' },
];
const CODE_TYPE_IDS = CODE_TYPES.map((c) => c.id);

/**
 * The canonical style object. Every QR's `styleConfig` is this shape.
 * Gradients are stored compactly as `{ type, rotation, color1, color2 }` (or
 * null) and expanded to qr-code-styling's `colorStops` form at render time.
 * Corner colors of '' mean "inherit the body (foreground) color".
 */
export const DEFAULT_STYLE = {
  // symbology
  codeType: 'qr',
  // body / dots
  dotStyle: 'square',
  fgColor: '#000000',
  dotGradient: null,
  // corners
  cornerSquareStyle: 'square',
  cornerSquareColor: '',
  cornerSquareGradient: null,
  cornerDotStyle: 'square',
  cornerDotColor: '',
  cornerDotGradient: null,
  // background
  bgColor: '#ffffff',
  bgTransparent: false,
  bgGradient: null,
  // logo
  logoUrl: '',
  logoSize: 0.4,
  hideBgDots: true,
  logoMargin: 10,
  // structure
  shape: 'square',
  margin: 10,
  // Default to M (15%) so logo-free codes stay visually minimal (fewer, larger
  // modules). A logo auto-raises this to H at render time — see
  // `effectiveErrorCorrectionLevel`.
  errorCorrectionLevel: 'M',
};

// ── Small internal helpers ──

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

function sanitizeColor(c) {
  if (typeof c !== 'string') return '';
  const v = c.trim();
  // CSS colors we emit are short hex strings; cap length to avoid storing junk.
  if (!v || v.length > 32) return '';
  return v;
}

/**
 * Sanitize a logo URL for persistence. Logos are fetched server-side through the
 * image proxy, so only absolute https URLs are kept — http and any other scheme
 * (and over-long values) are dropped to `''`. The client always submits https,
 * so this only ever rejects hand-crafted requests.
 */
function sanitizeLogoUrl(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (!v || v.length > 2048) return '';
  try {
    return new URL(v).protocol === 'https:' ? v : '';
  } catch {
    return '';
  }
}

/** bwip-js wants hex colors without a leading '#'; accepts RRGGBB or AARRGGBB. */
function hexNoHash(c, fallback) {
  const v = typeof c === 'string' ? c.trim().replace(/^#/, '') : '';
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v) ? v : fallback;
}

/** Expand a compact `{ type, rotation, color1, color2 }` into a qr-code-styling gradient, or undefined. */
function toStylingGradient(g) {
  if (!g || !g.color1 || !g.color2) return undefined;
  return {
    type: oneOf(g.type, GRADIENT_TYPES, 'linear'),
    rotation: clampNumber(g.rotation, 0, 360, 0),
    colorStops: [
      { offset: 0, color: g.color1 },
      { offset: 1, color: g.color2 },
    ],
  };
}

/** Sanitize a compact gradient for persistence; null when incomplete/invalid. */
function sanitizeGradient(g) {
  if (!g || typeof g !== 'object') return null;
  const color1 = sanitizeColor(g.color1);
  const color2 = sanitizeColor(g.color2);
  if (!color1 || !color2) return null;
  return {
    type: oneOf(g.type, GRADIENT_TYPES, 'linear'),
    rotation: clampNumber(g.rotation, 0, 360, 0),
    color1,
    color2,
  };
}

/**
 * Resolve a full style object from a client QR record.
 * Prefers `styleConfig` (object or JSON string); falls back to the legacy flat
 * fields so QR codes created before styleConfig existed still render correctly.
 */
export function normalizeStyle(qrcode) {
  if (!qrcode) return { ...DEFAULT_STYLE };

  let cfg = qrcode.styleConfig;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg);
    } catch {
      cfg = null;
    }
  }
  if (cfg && typeof cfg === 'object') {
    const merged = { ...DEFAULT_STYLE, ...cfg };
    // Coerce a removed/unknown symbology (e.g. a previously-saved Aztec) to QR.
    if (!CODE_TYPE_IDS.includes(merged.codeType)) merged.codeType = 'qr';
    return merged;
  }

  // Legacy fallback from flat fields.
  return {
    ...DEFAULT_STYLE,
    fgColor: qrcode.fgColor || DEFAULT_STYLE.fgColor,
    bgColor: qrcode.bgColor || DEFAULT_STYLE.bgColor,
    dotStyle: qrcode.dotStyle || DEFAULT_STYLE.dotStyle,
    cornerSquareStyle: qrcode.cornerSquareStyle || DEFAULT_STYLE.cornerSquareStyle,
    cornerDotStyle: qrcode.cornerDotStyle || DEFAULT_STYLE.cornerDotStyle,
    logoUrl: qrcode.logoUrl || '',
  };
}

/**
 * The error-correction level actually used to encode a QR.
 *
 * A center logo overlays (punches out) the modules beneath it, so the code only
 * stays scannable if there's enough redundancy to reconstruct them — that's what
 * level H (30%) buys. So whenever a logo is set we force H regardless of the
 * stored level. Without a logo we respect the user's choice (default M), which
 * keeps logo-free codes coarse and minimal-looking instead of densely packed.
 */
export function effectiveErrorCorrectionLevel(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  if (s.logoUrl) return 'H';
  return oneOf(s.errorCorrectionLevel, ERROR_CORRECTION_LEVELS, DEFAULT_STYLE.errorCorrectionLevel);
}

/**
 * Build the options object for `new QRCodeStyling(...)` / `.update(...)`.
 * @param {object} style  A (partial) style object — merged over DEFAULT_STYLE.
 * @param {object} opts   { data, width, height, type }
 */
export function buildQRStylingOptions(style, { data, width = 300, height = 300, type = 'svg' } = {}) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  const logoSrc = s.logoUrl ? `/api/proxy-image?url=${encodeURIComponent(s.logoUrl)}` : '';

  const dotGradient = toStylingGradient(s.dotGradient);
  const cornerSquareGradient = toStylingGradient(s.cornerSquareGradient);
  const cornerDotGradient = toStylingGradient(s.cornerDotGradient);
  const bgGradient = toStylingGradient(s.bgGradient);

  return {
    width,
    height,
    type,
    data: data || '',
    shape: oneOf(s.shape, QR_SHAPES, 'square'),
    margin: clampNumber(s.margin, 0, 50, DEFAULT_STYLE.margin),
    image: logoSrc,
    qrOptions: {
      errorCorrectionLevel: effectiveErrorCorrectionLevel(s),
    },
    dotsOptions: {
      type: oneOf(s.dotStyle, DOT_STYLES, 'square'),
      color: s.fgColor || DEFAULT_STYLE.fgColor,
      ...(dotGradient ? { gradient: dotGradient } : {}),
    },
    cornersSquareOptions: {
      type: oneOf(s.cornerSquareStyle, CORNER_SQUARE_STYLES, 'square'),
      color: s.cornerSquareColor || s.fgColor || DEFAULT_STYLE.fgColor,
      ...(cornerSquareGradient ? { gradient: cornerSquareGradient } : {}),
    },
    cornersDotOptions: {
      type: oneOf(s.cornerDotStyle, CORNER_DOT_STYLES, 'square'),
      color: s.cornerDotColor || s.fgColor || DEFAULT_STYLE.fgColor,
      ...(cornerDotGradient ? { gradient: cornerDotGradient } : {}),
    },
    backgroundOptions: {
      color: s.bgTransparent ? 'transparent' : (s.bgColor || DEFAULT_STYLE.bgColor),
      ...(!s.bgTransparent && bgGradient ? { gradient: bgGradient } : {}),
    },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: clampNumber(s.logoMargin, 0, 40, DEFAULT_STYLE.logoMargin),
      imageSize: clampNumber(s.logoSize, 0.1, 0.6, DEFAULT_STYLE.logoSize),
      hideBackgroundDots: Boolean(s.hideBgDots),
    },
  };
}

/**
 * Build options for bwip-js (used for non-QR symbologies: Data Matrix).
 * Pure — does not import bwip-js, so this module stays server-safe. bwip-js only
 * supports a flat foreground/background color + size/margin (no gradients,
 * shapes, or logos), so only those style fields are mapped.
 * @param {object} style  A (partial) style object — merged over DEFAULT_STYLE.
 * @param {object} opts   { data, scale }
 */
export function buildBwipOptions(style, { data, scale = 5 } = {}) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  const entry = CODE_TYPES.find((c) => c.id === s.codeType) || CODE_TYPES[0];
  const sc = clampNumber(scale, 1, 20, 5);
  const pad = clampNumber(s.margin, 0, 50, DEFAULT_STYLE.margin);
  // bwip-js padding is in pixels (not scaled), so a fixed margin shrinks to a
  // fraction of a module at higher scales. Guarantee at least ~2 modules of
  // quiet zone, which real-world scanners need to lock on (required for Data
  // Matrix). The user's margin still applies when larger.
  const quiet = Math.max(pad, sc * 2);

  const opts = {
    bcid: entry.bcid,
    text: data || '',
    scale: sc,
    paddingwidth: quiet,
    paddingheight: quiet,
    barcolor: hexNoHash(s.fgColor, '000000'),
  };
  // Omit backgroundcolor entirely for a transparent background.
  if (!s.bgTransparent) {
    opts.backgroundcolor = hexNoHash(s.bgColor, 'ffffff');
  }
  return opts;
}

/**
 * Validate/normalize an untrusted style object for persistence. Returns a clean
 * object containing only known keys with checked types, enums, and clamped
 * numbers — so the client can never store arbitrary or oversized JSON.
 */
export function sanitizeStyleConfig(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    codeType: oneOf(input.codeType, CODE_TYPE_IDS, DEFAULT_STYLE.codeType),
    dotStyle: oneOf(input.dotStyle, DOT_STYLES, DEFAULT_STYLE.dotStyle),
    fgColor: sanitizeColor(input.fgColor) || DEFAULT_STYLE.fgColor,
    dotGradient: sanitizeGradient(input.dotGradient),
    cornerSquareStyle: oneOf(input.cornerSquareStyle, CORNER_SQUARE_STYLES, DEFAULT_STYLE.cornerSquareStyle),
    cornerSquareColor: sanitizeColor(input.cornerSquareColor),
    cornerSquareGradient: sanitizeGradient(input.cornerSquareGradient),
    cornerDotStyle: oneOf(input.cornerDotStyle, CORNER_DOT_STYLES, DEFAULT_STYLE.cornerDotStyle),
    cornerDotColor: sanitizeColor(input.cornerDotColor),
    cornerDotGradient: sanitizeGradient(input.cornerDotGradient),
    bgColor: sanitizeColor(input.bgColor) || DEFAULT_STYLE.bgColor,
    bgTransparent: Boolean(input.bgTransparent),
    bgGradient: sanitizeGradient(input.bgGradient),
    logoUrl: sanitizeLogoUrl(input.logoUrl),
    logoSize: clampNumber(input.logoSize, 0.1, 0.6, DEFAULT_STYLE.logoSize),
    hideBgDots: input.hideBgDots === undefined ? DEFAULT_STYLE.hideBgDots : Boolean(input.hideBgDots),
    logoMargin: clampNumber(input.logoMargin, 0, 40, DEFAULT_STYLE.logoMargin),
    shape: oneOf(input.shape, QR_SHAPES, DEFAULT_STYLE.shape),
    margin: clampNumber(input.margin, 0, 50, DEFAULT_STYLE.margin),
    errorCorrectionLevel: oneOf(input.errorCorrectionLevel, ERROR_CORRECTION_LEVELS, DEFAULT_STYLE.errorCorrectionLevel),
  };
}

/**
 * Extract the legacy flat columns from a style object. Kept in sync with
 * `styleConfig` on every write so the server image route and any old reader
 * still work.
 */
export function legacyFieldsFromStyle(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  return {
    foregroundColor: s.fgColor || DEFAULT_STYLE.fgColor,
    backgroundColor: s.bgTransparent ? 'transparent' : (s.bgColor || DEFAULT_STYLE.bgColor),
    logoUrl: s.logoUrl || null,
    dotStyle: s.dotStyle || DEFAULT_STYLE.dotStyle,
    cornerSquareStyle: s.cornerSquareStyle || DEFAULT_STYLE.cornerSquareStyle,
    cornerDotStyle: s.cornerDotStyle || DEFAULT_STYLE.cornerDotStyle,
  };
}

// ──────────────────────────────────────────────
// Contrast / scannability
// ──────────────────────────────────────────────

/**
 * Contrast-ratio thresholds (WCAG formula) applied to a QR's foreground (the
 * dark "ink" — body dots + finder patterns) against its background. A scanner
 * needs the two to differ enough in luminance to tell modules apart.
 *
 * These are deliberately far more lenient than WCAG text-readability ratios
 * (4.5:1). A phone camera reads QR codes at much lower contrast than the eye
 * needs for body text, and the WCAG luminance formula is especially pessimistic
 * about saturated bright colors — e.g. cyan #00d4ff scores ~1.8:1 on white yet
 * scans every time (it's near-black in the red channel). So the hard floor only
 * catches colors that are genuinely close to indistinguishable; everything in
 * between is allowed with an advisory. (Regression-tested so no shipped preset
 * is ever blocked — see qrStyle.test.js.)
 *
 * - Below MIN_SCANNABLE_CONTRAST (colors nearly identical) saving is blocked.
 * - Between MIN and GOOD it's allowed but flagged as risky.
 * - At/above GOOD it's considered reliably scannable.
 */
export const MIN_SCANNABLE_CONTRAST = 1.5;
export const GOOD_CONTRAST = 3;

/** Parse a `#rgb` or `#rrggbb` hex string into { r, g, b } (0–255), or null. */
function parseHexColor(c) {
  if (typeof c !== 'string') return null;
  let v = c.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.replace(/./g, (ch) => ch + ch);
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance (0–1) of an { r, g, b } color. */
function relativeLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * WCAG contrast ratio (1–21) between two colors, or null if either isn't a hex
 * color we can parse (e.g. a named CSS color or gradient placeholder).
 */
export function contrastRatio(colorA, colorB) {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Every color the foreground "ink" can take — gradient stops, or the solid
 *  color, resolving blank corner colors back to the body color. */
function foregroundColors(s) {
  const out = [];
  const add = (...cs) => cs.forEach((c) => c && out.push(c));
  if (s.dotGradient) add(s.dotGradient.color1, s.dotGradient.color2);
  else add(s.fgColor);
  if (s.cornerSquareGradient) add(s.cornerSquareGradient.color1, s.cornerSquareGradient.color2);
  else add(s.cornerSquareColor || s.fgColor);
  if (s.cornerDotGradient) add(s.cornerDotGradient.color1, s.cornerDotGradient.color2);
  else add(s.cornerDotColor || s.fgColor);
  return out;
}

/** Every color the background can take — gradient stops or the solid color. */
function backgroundColors(s) {
  if (s.bgGradient) return [s.bgGradient.color1, s.bgGradient.color2].filter(Boolean);
  return [s.bgColor].filter(Boolean);
}

function meanLuminance(colors) {
  const lums = colors.map(parseHexColor).filter(Boolean).map(relativeLuminance);
  return lums.length ? lums.reduce((sum, l) => sum + l, 0) / lums.length : null;
}

/**
 * Assess whether a style's foreground/background colors give enough contrast to
 * scan, so the UI can warn (or block) before an unreadable code is saved.
 *
 * Works for both QR (gradients, corner colors) and Data Matrix (flat fg/bg).
 * Returns:
 *   { level, ratio, scannable, inverted, message }
 * where `level` is 'good' | 'warn' | 'fail' | 'unknown', `ratio` is the
 * worst-case contrast (null when it can't be measured), and `scannable` is
 * false only when the colors are confidently too low-contrast to read.
 */
export function evaluateContrast(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };

  // A transparent background takes on whatever surface it's placed over, so
  // there's no fixed ratio to measure. Advise rather than block.
  if (s.bgTransparent) {
    return {
      level: 'unknown',
      ratio: null,
      scannable: true,
      inverted: false,
      message:
        'Transparent background — scannability depends on the surface behind the code. Place it on a light surface that strongly contrasts the foreground.',
    };
  }

  const fgs = foregroundColors(s);
  const bgs = backgroundColors(s);

  // Worst-case (minimum) contrast across every foreground × background pair, so
  // a single low-contrast gradient stop is still caught.
  let ratio = Infinity;
  for (const fg of fgs) {
    for (const bg of bgs) {
      const r = contrastRatio(fg, bg);
      if (r != null && r < ratio) ratio = r;
    }
  }

  // Couldn't parse the colors (e.g. a non-hex CSS value) — don't block.
  if (!Number.isFinite(ratio)) {
    return {
      level: 'unknown',
      ratio: null,
      scannable: true,
      inverted: false,
      message: 'Couldn’t check contrast for these colors — use a dark foreground on a light background.',
    };
  }

  // Inverted = light ink on a dark background. High-contrast inverted codes scan
  // on modern phones but trip some older/native readers, so always flag them.
  const fgLum = meanLuminance(fgs);
  const bgLum = meanLuminance(bgs);
  const inverted = fgLum != null && bgLum != null && fgLum > bgLum;

  const rounded = Math.round(ratio * 10) / 10;
  let level;
  let scannable;
  let message;
  if (ratio < MIN_SCANNABLE_CONTRAST) {
    level = 'fail';
    scannable = false;
    message = `Contrast ${rounded}:1 is too low — this code likely won’t scan. Use a darker foreground or a lighter background (aim for ${GOOD_CONTRAST}:1 or higher).`;
  } else if (ratio < GOOD_CONTRAST) {
    level = 'warn';
    scannable = true;
    message = `Contrast ${rounded}:1 is on the low side — it may fail in poor lighting or on low-quality cameras. ${GOOD_CONTRAST}:1 or higher is safer.`;
  } else {
    level = 'good';
    scannable = true;
    message = `Contrast ${rounded}:1 — looks reliably scannable.`;
  }

  if (inverted && scannable) {
    message += ' Heads up: light-on-dark (inverted) codes aren’t read by every scanner — dark-on-light is safest.';
  }

  return { level, ratio, scannable, inverted, message };
}

/**
 * Normalize a user-supplied destination URL.
 *
 * - Trims surrounding whitespace.
 * - If no scheme is present (e.g. "example.com"), assumes https:// so the user
 *   doesn't have to type it. An existing scheme (https://, http://, ftp://…) is
 *   left untouched here — validity is enforced separately by
 *   `isValidDestinationUrl`, which rejects anything that isn't https.
 *
 * Returns the normalized string. Non-strings pass through unchanged.
 */
export function normalizeDestinationUrl(url) {
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  // Already has a "scheme://" prefix? Leave it as-is.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // Otherwise default to https.
  return `https://${trimmed}`;
}

/**
 * Validate a destination URL. Only absolute https:// URLs are allowed — plain
 * http:// (and any other scheme) is rejected so every redirect goes over TLS.
 * Run `normalizeDestinationUrl` first so scheme-less input is accepted.
 */
export function isValidDestinationUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * One-click style bundles. Each preset's `style` contains visual fields only
 * (never logoUrl/title/url), so applying a preset preserves the user's logo.
 */
export const PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    style: {
      dotStyle: 'square', fgColor: '#000000', dotGradient: null,
      cornerSquareStyle: 'square', cornerSquareColor: '', cornerSquareGradient: null,
      cornerDotStyle: 'square', cornerDotColor: '', cornerDotGradient: null,
      bgColor: '#ffffff', bgTransparent: false, bgGradient: null, shape: 'square',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    style: {
      dotStyle: 'rounded', fgColor: '#00d4ff',
      dotGradient: { type: 'linear', rotation: 45, color1: '#00d4ff', color2: '#7c3aed' },
      cornerSquareStyle: 'extra-rounded', cornerSquareColor: '#00d4ff', cornerSquareGradient: null,
      cornerDotStyle: 'dot', cornerDotColor: '#7c3aed', cornerDotGradient: null,
      bgColor: '#ffffff', bgTransparent: false, bgGradient: null, shape: 'square',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    style: {
      dotStyle: 'classy-rounded', fgColor: '#f59e0b',
      dotGradient: { type: 'radial', rotation: 0, color1: '#f59e0b', color2: '#f472b6' },
      cornerSquareStyle: 'extra-rounded', cornerSquareColor: '',
      cornerSquareGradient: { type: 'linear', rotation: 90, color1: '#f59e0b', color2: '#f472b6' },
      cornerDotStyle: 'dot', cornerDotColor: '#f472b6', cornerDotGradient: null,
      bgColor: '#fff7ed', bgTransparent: false, bgGradient: null, shape: 'square',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    style: {
      dotStyle: 'dots', fgColor: '#16a34a',
      dotGradient: { type: 'linear', rotation: 0, color1: '#16a34a', color2: '#065f46' },
      cornerSquareStyle: 'dot', cornerSquareColor: '#065f46', cornerSquareGradient: null,
      cornerDotStyle: 'dot', cornerDotColor: '#16a34a', cornerDotGradient: null,
      bgColor: '#ffffff', bgTransparent: false, bgGradient: null, shape: 'square',
    },
  },
  {
    id: 'mono-rounded',
    name: 'Mono',
    style: {
      dotStyle: 'extra-rounded', fgColor: '#0f172a', dotGradient: null,
      cornerSquareStyle: 'extra-rounded', cornerSquareColor: '#0f172a', cornerSquareGradient: null,
      cornerDotStyle: 'dot', cornerDotColor: '#0f172a', cornerDotGradient: null,
      bgColor: '#f1f5f9', bgTransparent: false, bgGradient: null, shape: 'square',
    },
  },
];
