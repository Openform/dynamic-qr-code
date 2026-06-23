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
  errorCorrectionLevel: 'H',
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
      errorCorrectionLevel: oneOf(s.errorCorrectionLevel, ERROR_CORRECTION_LEVELS, 'H'),
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
    logoUrl:
      typeof input.logoUrl === 'string' && input.logoUrl.length <= 2048
        ? input.logoUrl.trim()
        : '',
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
