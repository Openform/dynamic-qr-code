/**
 * Campaign pages: a simple mobile page a code can send scans to, built from
 * blocks (a header, text, an image, buttons, details, an offer) and a theme.
 * QR Go owns the layout; the account chooses the content and the look.
 *
 * This file holds the rules for what a page may contain. The API checks every
 * request with them (lib/campaignPagesApi.js), and the editor and the public
 * page will use the same rules, so this file must stay free of server-only
 * imports.
 *
 * A page is stored as a row in `campaign_pages` (see db.js): its name, its
 * end date and what to show after it, and `content`, the JSON this file
 * checks:
 *
 *   {
 *     v: 1,                 // CONTENT_VERSION, so the shape can change later
 *     theme: 'fresh',       // one of THEMES
 *     brand: '#1F6F4A',     // the brand colour, as #RRGGBB
 *     font: null,           // one of FONTS, or null for the theme's own font
 *     blocks: [ … ],        // top to bottom; the header is always first
 *   }
 *
 * Security: nothing in a page is ever treated as HTML. Text is plain, or the
 * small Markdown subset of the legal pages (lib/markdown.js) for Text blocks.
 * Every button's link is rebuilt from checked fields by the same builders as
 * code types (lib/contentTypes.js), so only https://, mailto:, tel: and the
 * WhatsApp and Google Maps links they make can appear, and every text field
 * rejects control characters and the invisible characters that change text
 * direction.
 */

import { checkText, normalizeLines, parseContent } from './contentTypes';
import { contrastRatio } from './qrStyle';
import { parseIsoWithOffset, isTooFarAhead } from './destinationChanges';
import { toSqlDateTime, sqlToIso } from './analyticsFilters';

export const CONTENT_VERSION = 1;

/** How much a page can hold. */
export const PAGE_LIMITS = {
  name: 100, // campaign_pages.name
  blocks: 20,
  images: 6,
  buttons: 6,
  detailRows: 8,
  title: 120,
  tagline: 200,
  text: 2000,
  imageAlt: 200,
  imageCaption: 200,
  buttonLabel: 60,
  detailLabel: 40,
  detailValue: 120,
  offerLabel: 60,
  offerHeadline: 120,
  offerText: 300,
  promoCode: 40,
};

/** The looks a page can have. */
export const THEMES = [
  { id: 'fresh', name: 'Fresh' },
  { id: 'night', name: 'Night' },
  { id: 'bold', name: 'Bold' },
];

/** Fonts a page can use instead of its theme's own. */
export const FONTS = [
  { id: 'inter', name: 'Inter' },
  { id: 'space-grotesk', name: 'Space Grotesk' },
  { id: 'fraunces', name: 'Fraunces' },
];

export const BLOCK_TYPES = ['header', 'text', 'image', 'buttons', 'details', 'offer'];

/**
 * What a button can do, and the code type (lib/contentTypes.js) whose fields
 * and link it uses:
 *
 *   link       { url }
 *   call       { number }
 *   email      { to, subject?, body? }
 *   whatsapp   { number, message? }
 *   directions { query }
 */
export const BUTTON_KINDS = [
  { id: 'link', label: 'Link', contentType: 'url' },
  { id: 'call', label: 'Call', contentType: 'phone' },
  { id: 'email', label: 'Email', contentType: 'email' },
  { id: 'whatsapp', label: 'WhatsApp', contentType: 'whatsapp' },
  { id: 'directions', label: 'Directions', contentType: 'location' },
];

/** Icons a Details row can show. */
export const DETAIL_ICONS = ['calendar', 'clock', 'pin', 'info', 'tag'];

/**
 * What a page shows once its end date has passed: 'ended' replaces the
 * blocks with "This campaign has ended" (and, optionally, one kept button);
 * 'keep' goes on showing the page as it is.
 */
export const AFTER_END = ['ended', 'keep'];

export const DEFAULT_THEME = 'fresh';
export const DEFAULT_BRAND = '#1F6F4A';

const BLOCK_ID = /^[A-Za-z0-9_-]{1,32}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const BUTTON_KIND_BY_ID = new Map(BUTTON_KINDS.map((k) => [k.id, k]));

function fail(path, error) {
  return { ok: false, path, error };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** An image reference: null, or the id of one of the page's own images. */
function checkImage(value, path, imageIds, label) {
  if (value === null || value === undefined || value === '') return { value: null };
  if (Number.isInteger(value) && value > 0 && imageIds.has(value)) return { value };
  return { error: fail(path, `Choose ${label} again: that image isn't part of this page.`) };
}

/** A text field, as `checkText` in lib/contentTypes.js, with its path on failure. */
function field(value, path, options) {
  const checked = checkText(value, options);
  if (checked.error) return { error: fail(path, checked.error) };
  return { value: options.multiline ? normalizeLines(checked.value) : checked.value };
}

// ── Blocks ──
// Each returns `{ block }` with only the fields it knows, cleaned, or
// `{ error }`. `ctx` carries the page's image ids and the images used so far.

function parseHeader(input, path, ctx) {
  const cover = checkImage(input.cover, `${path}.cover`, ctx.imageIds, 'the cover photo');
  if (cover.error) return cover;
  const logo = checkImage(input.logo, `${path}.logo`, ctx.imageIds, 'the logo');
  if (logo.error) return logo;
  const title = field(input.title, `${path}.title`, { label: 'a title', max: PAGE_LIMITS.title, required: true });
  if (title.error) return title;
  const tagline = field(input.tagline, `${path}.tagline`, { label: 'the tagline', max: PAGE_LIMITS.tagline });
  if (tagline.error) return tagline;
  return { block: { cover: cover.value, logo: logo.value, title: title.value, tagline: tagline.value } };
}

function parseTextBlock(input, path) {
  const text = field(input.text, `${path}.text`, {
    label: 'the text',
    max: PAGE_LIMITS.text,
    required: true,
    multiline: true,
  });
  if (text.error) return text;
  return { block: { text: text.value } };
}

function parseImageBlock(input, path, ctx) {
  const image = checkImage(input.image, `${path}.image`, ctx.imageIds, 'the photo');
  if (image.error) return image;
  const alt = field(input.alt, `${path}.alt`, { label: 'the description', max: PAGE_LIMITS.imageAlt });
  if (alt.error) return alt;
  const caption = field(input.caption, `${path}.caption`, { label: 'the caption', max: PAGE_LIMITS.imageCaption });
  if (caption.error) return caption;
  let link = '';
  if (typeof input.link === 'string' && input.link.trim()) {
    const checked = parseContent('url', { url: input.link });
    if (!checked.ok) return { error: fail(`${path}.link`, checked.error) };
    link = checked.destination;
  }
  return { block: { image: image.value, alt: alt.value, caption: caption.value, link } };
}

function parseButton(input, path, ctx) {
  if (!isObject(input)) return { error: fail(path, 'Each button needs a label and what it does.') };
  if (typeof input.id !== 'string' || !BLOCK_ID.test(input.id)) {
    return { error: fail(`${path}.id`, 'A button is missing its id.') };
  }
  if (ctx.ids.has(input.id)) return { error: fail(`${path}.id`, 'Two blocks or buttons have the same id.') };
  ctx.ids.add(input.id);

  const kind = BUTTON_KIND_BY_ID.get(input.kind);
  if (!kind) return { error: fail(`${path}.kind`, 'Choose what the button does.') };
  const label = field(input.label, `${path}.label`, { label: 'a label', max: PAGE_LIMITS.buttonLabel, required: true });
  if (label.error) return label;

  const checked = parseContent(kind.contentType, isObject(input.fields) ? input.fields : {});
  if (!checked.ok) return { error: fail(`${path}.fields${checked.field ? `.${checked.field}` : ''}`, checked.error) };
  ctx.buttonIds.add(input.id);
  return { button: { id: input.id, kind: kind.id, label: label.value, fields: checked.content } };
}

function parseButtonsBlock(input, path, ctx) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) return { error: fail(`${path}.items`, 'Add at least one button.') };
  if (items.length > PAGE_LIMITS.buttons) {
    return { error: fail(`${path}.items`, `A Buttons block can have at most ${PAGE_LIMITS.buttons} buttons.`) };
  }
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const checked = parseButton(items[i], `${path}.items.${i}`, ctx);
    if (checked.error) return checked;
    out.push(checked.button);
  }
  return { block: { items: out } };
}

function parseDetailsBlock(input, path) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) return { error: fail(`${path}.rows`, 'Add at least one detail.') };
  if (rows.length > PAGE_LIMITS.detailRows) {
    return { error: fail(`${path}.rows`, `A Details block can have at most ${PAGE_LIMITS.detailRows} rows.`) };
  }
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = isObject(rows[i]) ? rows[i] : {};
    const rowPath = `${path}.rows.${i}`;
    const icon = DETAIL_ICONS.includes(row.icon) ? row.icon : null;
    const label = field(row.label, `${rowPath}.label`, { label: 'the label', max: PAGE_LIMITS.detailLabel });
    if (label.error) return label;
    const value = field(row.value, `${rowPath}.value`, { label: 'the detail', max: PAGE_LIMITS.detailValue, required: true });
    if (value.error) return value;
    out.push({ icon, label: label.value, value: value.value });
  }
  return { block: { rows: out } };
}

function parseOfferBlock(input, path) {
  const label = field(input.label, `${path}.label`, { label: 'the small label', max: PAGE_LIMITS.offerLabel });
  if (label.error) return label;
  const headline = field(input.headline, `${path}.headline`, {
    label: 'a headline',
    max: PAGE_LIMITS.offerHeadline,
    required: true,
  });
  if (headline.error) return headline;
  const text = field(input.text, `${path}.text`, { label: 'the text', max: PAGE_LIMITS.offerText, multiline: true });
  if (text.error) return text;
  const code = field(input.code, `${path}.code`, { label: 'the promo code', max: PAGE_LIMITS.promoCode });
  if (code.error) return code;
  return {
    block: {
      label: label.value,
      headline: headline.value,
      text: text.value,
      code: code.value,
      // A Copy button only makes sense next to a code.
      copyButton: Boolean(code.value) && input.copyButton !== false,
    },
  };
}

const BLOCK_PARSERS = {
  header: parseHeader,
  text: parseTextBlock,
  image: parseImageBlock,
  buttons: parseButtonsBlock,
  details: parseDetailsBlock,
  offer: parseOfferBlock,
};

function parseBlock(input, path, ctx, index) {
  if (!isObject(input)) return { error: fail(path, 'A block is missing.') };
  if (!BLOCK_TYPES.includes(input.type)) return { error: fail(`${path}.type`, 'This kind of block isn’t available.') };
  if (input.type === 'header' && index !== 0) {
    return { error: fail(path, 'The header is always the first block, and a page has only one.') };
  }
  if (typeof input.id !== 'string' || !BLOCK_ID.test(input.id)) {
    return { error: fail(`${path}.id`, 'A block is missing its id.') };
  }
  if (ctx.ids.has(input.id)) return { error: fail(`${path}.id`, 'Two blocks or buttons have the same id.') };
  ctx.ids.add(input.id);

  const checked = BLOCK_PARSERS[input.type](input, path, ctx);
  if (checked.error) return checked;
  // The header can't be hidden: every page starts with it.
  const hidden = input.type !== 'header' && input.hidden === true;
  return { block: { id: input.id, type: input.type, hidden, ...checked.block } };
}

/** Every image a block refers to. */
function imagesIn(block) {
  switch (block.type) {
    case 'header':
      return [block.cover, block.logo];
    case 'image':
      return [block.image];
    default:
      return [];
  }
}

/**
 * Check a page's content from a request (untrusted). `imageIds` is the set of
 * ids of the images that belong to this page (none yet for a new page): a
 * block can only show one of those.
 *
 * Returns `{ ok: true, content, buttonIds }` with the cleaned content (only
 * known fields, in a fixed shape) and the ids of its buttons, or
 * `{ ok: false, path, error }` with where the problem is (e.g.
 * "blocks.2.items.0.fields.number") and a message to show.
 */
export function parsePageContent(input, { imageIds = new Set() } = {}) {
  if (!isObject(input)) return fail('content', 'The page’s content is missing.');

  const theme = THEMES.some((t) => t.id === input.theme) ? input.theme : null;
  if (!theme) return fail('theme', 'Choose a theme.');
  if (typeof input.brand !== 'string' || !HEX_COLOR.test(input.brand)) {
    return fail('brand', 'Choose a brand colour.');
  }
  const brand = input.brand.toUpperCase();
  let font = null;
  if (input.font !== null && input.font !== undefined && input.font !== '') {
    if (!FONTS.some((f) => f.id === input.font)) return fail('font', 'Choose a font.');
    font = input.font;
  }

  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (blocks.length === 0 || blocks[0]?.type !== 'header') {
    return fail('blocks', 'A page starts with its header.');
  }
  if (blocks.length > PAGE_LIMITS.blocks) {
    return fail('blocks', `A page can have at most ${PAGE_LIMITS.blocks} blocks.`);
  }

  const ctx = { imageIds, ids: new Set(), buttonIds: new Set() };
  const out = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const checked = parseBlock(blocks[i], `blocks.${i}`, ctx, i);
    if (checked.error) return checked.error;
    out.push(checked.block);
  }

  const images = new Set(out.flatMap(imagesIn).filter((id) => id !== null));
  if (images.size > PAGE_LIMITS.images) {
    return fail('blocks', `A page can show at most ${PAGE_LIMITS.images} images.`);
  }

  return {
    ok: true,
    content: { v: CONTENT_VERSION, theme, brand, font, blocks: out },
    buttonIds: ctx.buttonIds,
  };
}

/** Check a page's name (only its owner sees it). Returns `{ value }` or `{ error }`. */
export function checkPageName(value) {
  return checkText(value, { label: 'a name', max: PAGE_LIMITS.name, required: true });
}

/**
 * Check a whole page from a create or save request (untrusted):
 *
 *   { name, content, endsAt?, afterEnd?, keptButton? }
 *
 * `endsAt` is an ISO time with its offset (e.g. from `Date#toISOString()`),
 * or null/'' for no end. `keptButton` is the id of one of the page's buttons
 * to keep showing after the end, or null.
 *
 * Returns `{ ok: true, page }` ready to store (`endsAt` as UTC
 * "YYYY-MM-DD HH:MM:SS" or null), or `{ ok: false, path, error }`.
 */
export function parsePageInput(body, { imageIds = new Set(), nowMs = Date.now() } = {}) {
  if (!isObject(body)) return fail(null, 'Invalid request body.');

  const name = checkPageName(body.name);
  if (name.error) return fail('name', name.error);

  const checked = parsePageContent(body.content, { imageIds });
  if (!checked.ok) return checked;

  let endsAt = null;
  if (body.endsAt !== null && body.endsAt !== undefined && body.endsAt !== '') {
    const ms = parseIsoWithOffset(body.endsAt);
    if (Number.isNaN(ms)) return fail('endsAt', 'Enter a valid end date and time.');
    if (isTooFarAhead(ms, nowMs)) return fail('endsAt', 'The end can be at most 5 years ahead.');
    endsAt = toSqlDateTime(ms);
  }

  const afterEnd = body.afterEnd === undefined ? 'ended' : body.afterEnd;
  if (!AFTER_END.includes(afterEnd)) return fail('afterEnd', 'Choose what the page shows after it ends.');

  let keptButton = null;
  if (afterEnd === 'ended' && body.keptButton !== null && body.keptButton !== undefined && body.keptButton !== '') {
    if (!checked.buttonIds.has(body.keptButton)) {
      return fail('keptButton', 'Choose one of this page’s buttons to keep, or none.');
    }
    keptButton = body.keptButton;
  }

  return { ok: true, page: { name: name.value, content: checked.content, endsAt, afterEnd, keptButton } };
}

/** The content of a new, empty page: just its header. */
export function newPageContent(title) {
  return {
    v: CONTENT_VERSION,
    theme: DEFAULT_THEME,
    brand: DEFAULT_BRAND,
    font: null,
    blocks: [{ id: 'header', type: 'header', hidden: false, cover: null, logo: null, title, tagline: '' }],
  };
}

/**
 * The link a stored button opens, rebuilt from its checked fields. Null when
 * the button isn't one this file would accept (then it must not be shown).
 */
export function buttonLink(button) {
  const kind = BUTTON_KIND_BY_ID.get(button?.kind);
  if (!kind) return null;
  const checked = parseContent(kind.contentType, button.fields);
  return checked.ok ? checked.destination : null;
}

/**
 * Text colour for words on `background`: `light` when it's readable there
 * (4.5:1, the WCAG level for normal text), otherwise whichever of the two
 * reads better. Used for button text on the brand colour, so no page ends up
 * with unreadable buttons whatever colour is chosen.
 */
export function pickTextColor(background, { light = '#FFFFFF', dark = '#141414' } = {}) {
  const onLight = contrastRatio(background, light);
  const onDark = contrastRatio(background, dark);
  if (onLight === null || onDark === null) return dark;
  if (onLight >= 4.5) return light;
  return onDark >= onLight ? dark : light;
}

// ── Showing a page ──

/**
 * How a code's main destination, a scheduled change or a schedule points at
 * a campaign page: "qrgo-page:<id>", stored in the same destination_url
 * columns as web links. The scan route sends such a scan to the page's path
 * under the code (pagePath), so it works on every domain the app is served
 * from.
 */
export const PAGE_REFERENCE_PREFIX = 'qrgo-page:';
const PAGE_REFERENCE = /^qrgo-page:([1-9][0-9]{0,9})$/;

/** The destination value that points at a page. */
export function pageReference(pageId) {
  return `${PAGE_REFERENCE_PREFIX}${pageId}`;
}

/** The page id in a destination value, or null when it isn't a page reference. */
export function pageIdFromReference(value) {
  const match = typeof value === 'string' ? value.match(PAGE_REFERENCE) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Where a page is shown: under the code that links to it, so the page can
 * check that code (and its password) on every visit.
 */
export function pagePath(shortId, pageId) {
  return `/r/${encodeURIComponent(shortId)}/p/${pageId}`;
}

/** An end time as stored (UTC "YYYY-MM-DD HH:MM:SS") or as an ISO string → ms, or NaN. */
function endTime(value) {
  if (!value) return NaN;
  const text = String(value);
  return Date.parse(text.includes('T') ? text : sqlToIso(text));
}

/** True once a page's campaign is over and it should show the ended message. */
export function isPageEnded(page, nowMs = Date.now()) {
  if (page?.afterEnd === 'keep') return false;
  const ends = endTime(page?.endsAt);
  return Number.isFinite(ends) && ends <= nowMs;
}

/**
 * What a page shows at `nowMs`, from its stored row: `{ ended, header,
 * blocks, keptButton }`. While it's live, `blocks` are the blocks under the
 * header that aren't hidden. Once it has ended, `blocks` is empty and
 * `keptButton` is the one button the owner chose to keep showing (or null).
 */
export function pageView(page, nowMs = Date.now()) {
  const all = Array.isArray(page?.content?.blocks) ? page.content.blocks : [];
  const header = all[0]?.type === 'header' ? all[0] : null;
  const rest = header ? all.slice(1) : all;
  if (!isPageEnded(page, nowMs)) {
    return { ended: false, header, blocks: rest.filter((block) => !block.hidden), keptButton: null };
  }
  const buttons = rest.flatMap((block) => (block.type === 'buttons' && Array.isArray(block.items) ? block.items : []));
  const keptButton = page.keptButton ? buttons.find((button) => button.id === page.keptButton) ?? null : null;
  return { ended: true, header, blocks: [], keptButton };
}
