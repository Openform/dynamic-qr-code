/**
 * Campaign pages: a simple mobile page a code can send scans to, built from
 * blocks (a header, text, an image, buttons, details, an offer, questions,
 * opening hours, a price list, a gallery) and a theme.
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
 * direction. Calendar and contact buttons download a file instead, built on
 * the server from the saved page's checked fields (lib/pageFiles.js).
 */

import { checkText, isValidEmailAddress, normalizeLines, parseContent } from './contentTypes';
import { contrastRatio } from './qrStyle';
import { parseIsoWithOffset, isTooFarAhead } from './destinationChanges';
import { isValidTimeZone } from './scheduleInput';
import { toSqlDateTime, sqlToIso } from './analyticsFilters';

export const CONTENT_VERSION = 1;

/** How much a page can hold. */
export const PAGE_LIMITS = {
  name: 100, // campaign_pages.name
  blocks: 20,
  images: 16, // shown on one page; a gallery holds up to 8
  buttons: 6,
  detailRows: 8,
  blockTitle: 80,
  faqItems: 12,
  faqQuestion: 150,
  faqAnswer: 1000,
  hoursPeriods: 2, // a day can have a break, e.g. 12:00–15:00 and 18:00–22:00
  hoursNote: 160,
  priceItems: 30,
  priceName: 80,
  priceDescription: 200,
  price: 24,
  priceTag: 24,
  galleryImages: 8,
  eventTitle: 120,
  eventLocation: 200,
  eventDetails: 500,
  contactName: 100,
  contactOrganisation: 100,
  contactAddress: 200,
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

export const BLOCK_TYPES = ['header', 'text', 'image', 'buttons', 'details', 'offer', 'faq', 'hours', 'prices', 'gallery'];

/**
 * What a button can do. Most open a link built by a code type
 * (lib/contentTypes.js) from its fields:
 *
 *   link       { url }
 *   call       { number }
 *   email      { to, subject?, body? }
 *   whatsapp   { number, message? }
 *   directions { query }
 *
 * Two download a file instead (`file` is its extension), built from the
 * fields by lib/pageFiles.js:
 *
 *   calendar   { title, startsAt, endsAt?, location?, details? } — an event
 *              (.ics); times are ISO, as Date#toISOString() gives them
 *   contact    { name, organisation?, phone?, email?, website?, address? } —
 *              a contact card (.vcf) with a phone number, email or website
 */
export const BUTTON_KINDS = [
  { id: 'link', label: 'Link', contentType: 'url' },
  { id: 'call', label: 'Call', contentType: 'phone' },
  { id: 'email', label: 'Email', contentType: 'email' },
  { id: 'whatsapp', label: 'WhatsApp', contentType: 'whatsapp' },
  { id: 'directions', label: 'Directions', contentType: 'location' },
  { id: 'calendar', label: 'Add to calendar', file: 'ics' },
  { id: 'contact', label: 'Save contact', file: 'vcf' },
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
// "HH:MM", 00:00 to 23:59.
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const BUTTON_KIND_BY_ID = new Map(BUTTON_KINDS.map((k) => [k.id, k]));

function fail(path, error) {
  return { ok: false, path, error };
}

// A page's own links go to websites. (Codes can also point at a campaign
// page, which the website check accepts, but a page can't link to another.)
const WEB_LINK_ERROR = 'Enter a web address, like example.com.';
function isWebLink(url) {
  return typeof url === 'string' && url.startsWith('https://');
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
    if (!isWebLink(checked.destination)) return { error: fail(`${path}.link`, WEB_LINK_ERROR) };
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

  const checked = checkButtonFields(kind, isObject(input.fields) ? input.fields : {}, ctx.nowMs);
  if (!checked.ok) return { error: fail(`${path}.fields${checked.field ? `.${checked.field}` : ''}`, checked.error) };
  ctx.buttonIds.add(input.id);
  return { button: { id: input.id, kind: kind.id, label: label.value, fields: checked.content } };
}

/**
 * A button's fields, checked for its kind: `{ ok: true, content, destination? }`
 * (`destination` is the link for kinds that open one) or
 * `{ ok: false, field, error }`.
 */
function checkButtonFields(kind, fields, nowMs) {
  if (kind.id === 'calendar') return checkEventFields(fields, nowMs);
  if (kind.id === 'contact') return checkContactFields(fields);
  const checked = parseContent(kind.contentType, fields);
  if (!checked.ok) return checked;
  if (kind.id === 'link' && !isWebLink(checked.destination)) return { ok: false, field: 'url', error: WEB_LINK_ERROR };
  return checked;
}

function fieldError(field, error) {
  return { ok: false, field, error };
}

/** A calendar button's event. */
function checkEventFields(fields, nowMs = Date.now()) {
  const title = checkText(fields.title, { label: 'the event’s name', max: PAGE_LIMITS.eventTitle, required: true });
  if (title.error) return fieldError('title', title.error);

  const startMs = typeof fields.startsAt === 'string' && fields.startsAt ? parseIsoWithOffset(fields.startsAt) : NaN;
  if (Number.isNaN(startMs)) return fieldError('startsAt', 'Enter when the event starts.');
  if (isTooFarAhead(startMs, nowMs)) return fieldError('startsAt', 'The event can be at most 5 years ahead.');
  let endsAt = '';
  if (typeof fields.endsAt === 'string' && fields.endsAt) {
    const endMs = parseIsoWithOffset(fields.endsAt);
    if (Number.isNaN(endMs)) return fieldError('endsAt', 'Enter a valid end, or leave it empty.');
    if (endMs <= startMs) return fieldError('endsAt', 'The event has to end after it starts.');
    if (isTooFarAhead(endMs, nowMs)) return fieldError('endsAt', 'The event can be at most 5 years ahead.');
    endsAt = new Date(endMs).toISOString();
  }

  const location = checkText(fields.location, { label: 'the place', max: PAGE_LIMITS.eventLocation });
  if (location.error) return fieldError('location', location.error);
  const details = checkText(fields.details, { label: 'the details', max: PAGE_LIMITS.eventDetails, multiline: true });
  if (details.error) return fieldError('details', details.error);

  return {
    ok: true,
    content: {
      title: title.value,
      startsAt: new Date(startMs).toISOString(),
      endsAt,
      location: location.value,
      details: normalizeLines(details.value),
    },
  };
}

/** A contact button's card: a name and at least one way to get in touch. */
function checkContactFields(fields) {
  const name = checkText(fields.name, { label: 'the name', max: PAGE_LIMITS.contactName, required: true });
  if (name.error) return fieldError('name', name.error);
  const organisation = checkText(fields.organisation, { label: 'the business name', max: PAGE_LIMITS.contactOrganisation });
  if (organisation.error) return fieldError('organisation', organisation.error);

  let phone = '';
  if (String(fields.phone ?? '').trim()) {
    const checked = parseContent('phone', { number: fields.phone });
    if (!checked.ok) return fieldError('phone', checked.error);
    phone = checked.content.number;
  }
  const email = String(fields.email ?? '').trim();
  if (email && !isValidEmailAddress(email)) return fieldError('email', 'Enter a valid email address, like hello@example.com.');
  let website = '';
  if (String(fields.website ?? '').trim()) {
    const checked = parseContent('url', { url: fields.website });
    if (!checked.ok) return fieldError('website', checked.error);
    if (!isWebLink(checked.destination)) return fieldError('website', WEB_LINK_ERROR);
    website = checked.destination;
  }
  if (!phone && !email && !website) return fieldError('phone', 'Add a phone number, email address or website.');

  const address = checkText(fields.address, { label: 'the address', max: PAGE_LIMITS.contactAddress });
  if (address.error) return fieldError('address', address.error);

  return { ok: true, content: { name: name.value, organisation: organisation.value, phone, email, website, address: address.value } };
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

/** A list in a block: at least one item and at most `max`, each checked by `parseItem`. */
function parseItems(input, path, { max, empty, tooMany, allowEmpty = false }, parseItem) {
  const items = Array.isArray(input) ? input : [];
  if (items.length === 0 && !allowEmpty) return { error: fail(path, empty) };
  if (items.length > max) return { error: fail(path, tooMany) };
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const checked = parseItem(isObject(items[i]) ? items[i] : {}, `${path}.${i}`);
    if (checked.error) return checked;
    out.push(checked.item);
  }
  return { items: out };
}

/** An optional heading over a block, like "Questions" or "Coffee". */
function blockTitle(input, path) {
  return field(input.title, `${path}.title`, { label: 'the heading', max: PAGE_LIMITS.blockTitle });
}

function parseFaqBlock(input, path) {
  const title = blockTitle(input, path);
  if (title.error) return title;
  const items = parseItems(
    input.items,
    `${path}.items`,
    {
      max: PAGE_LIMITS.faqItems,
      empty: 'Add at least one question.',
      tooMany: `A FAQ block can have at most ${PAGE_LIMITS.faqItems} questions.`,
    },
    (item, itemPath) => {
      const question = field(item.question, `${itemPath}.question`, { label: 'the question', max: PAGE_LIMITS.faqQuestion, required: true });
      if (question.error) return question;
      const answer = field(item.answer, `${itemPath}.answer`, { label: 'the answer', max: PAGE_LIMITS.faqAnswer, required: true, multiline: true });
      if (answer.error) return answer;
      return { item: { question: question.value, answer: answer.value } };
    }
  );
  if (items.error) return items;
  return { block: { title: title.value, items: items.items } };
}

/** A day's opening times: none (closed), or up to two "HH:MM" to "HH:MM" periods. */
function parseDay(input, path) {
  const periods = Array.isArray(input?.periods) ? input.periods : [];
  if (periods.length > PAGE_LIMITS.hoursPeriods) {
    return { error: fail(path, `A day can have at most ${PAGE_LIMITS.hoursPeriods} opening times.`) };
  }
  const out = [];
  for (let i = 0; i < periods.length; i += 1) {
    const period = isObject(periods[i]) ? periods[i] : {};
    for (const key of ['open', 'close']) {
      if (typeof period[key] !== 'string' || !TIME_OF_DAY.test(period[key])) {
        return { error: fail(`${path}.periods.${i}.${key}`, key === 'open' ? 'Enter when it opens.' : 'Enter when it closes.') };
      }
    }
    out.push({ open: period.open, close: period.close });
  }
  return { day: { periods: out } };
}

/**
 * Opening hours: a time for each day, Monday first, on the local clock in
 * `timeZone` (lib/openingHours.js works out "Open now"). A close at or
 * before the open runs past midnight, and the same open and close means
 * open all day, as in weekly schedules.
 */
function parseHoursBlock(input, path) {
  const title = blockTitle(input, path);
  if (title.error) return title;
  if (!isValidTimeZone(input.timeZone)) return { error: fail(`${path}.timeZone`, 'Choose the time zone the hours are in.') };
  const days = Array.isArray(input.days) ? input.days : [];
  if (days.length !== 7) return { error: fail(`${path}.days`, 'Opening hours need a time for every day of the week.') };
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const checked = parseDay(days[i], `${path}.days.${i}`);
    if (checked.error) return checked;
    out.push(checked.day);
  }
  const note = field(input.note, `${path}.note`, { label: 'the note', max: PAGE_LIMITS.hoursNote });
  if (note.error) return note;
  return { block: { title: title.value, timeZone: input.timeZone, days: out, note: note.value, showStatus: input.showStatus !== false } };
}

function parsePricesBlock(input, path) {
  const title = blockTitle(input, path);
  if (title.error) return title;
  const items = parseItems(
    input.items,
    `${path}.items`,
    {
      max: PAGE_LIMITS.priceItems,
      empty: 'Add at least one item.',
      tooMany: `A price list can have at most ${PAGE_LIMITS.priceItems} items.`,
    },
    (item, itemPath) => {
      const name = field(item.name, `${itemPath}.name`, { label: 'the item’s name', max: PAGE_LIMITS.priceName, required: true });
      if (name.error) return name;
      const price = field(item.price, `${itemPath}.price`, { label: 'the price', max: PAGE_LIMITS.price });
      if (price.error) return price;
      const description = field(item.description, `${itemPath}.description`, { label: 'the description', max: PAGE_LIMITS.priceDescription });
      if (description.error) return description;
      const tag = field(item.tag, `${itemPath}.tag`, { label: 'the tag', max: PAGE_LIMITS.priceTag });
      if (tag.error) return tag;
      return { item: { name: name.value, price: price.value, description: description.value, tag: tag.value } };
    }
  );
  if (items.error) return items;
  return { block: { title: title.value, items: items.items } };
}

function parseGalleryBlock(input, path, ctx) {
  // Empty while the owner is adding photos; it isn't shown until it has one.
  const items = parseItems(
    input.items,
    `${path}.items`,
    { max: PAGE_LIMITS.galleryImages, tooMany: `A gallery can have at most ${PAGE_LIMITS.galleryImages} photos.`, allowEmpty: true },
    (item, itemPath) => {
      const image = checkImage(item.image, `${itemPath}.image`, ctx.imageIds, 'the photo');
      if (image.error) return image;
      if (image.value === null) return { error: fail(`${itemPath}.image`, 'Choose a photo, or remove this one.') };
      const alt = field(item.alt, `${itemPath}.alt`, { label: 'the description', max: PAGE_LIMITS.imageAlt });
      if (alt.error) return alt;
      return { item: { image: image.value, alt: alt.value } };
    }
  );
  if (items.error) return items;
  return { block: { items: items.items } };
}

const BLOCK_PARSERS = {
  header: parseHeader,
  text: parseTextBlock,
  image: parseImageBlock,
  buttons: parseButtonsBlock,
  details: parseDetailsBlock,
  offer: parseOfferBlock,
  faq: parseFaqBlock,
  hours: parseHoursBlock,
  prices: parsePricesBlock,
  gallery: parseGalleryBlock,
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

/** Every image a page's content shows (header cover and logo, image blocks, galleries). */
export function imageIdsInContent(content) {
  const ids = new Set();
  for (const block of Array.isArray(content?.blocks) ? content.blocks : []) {
    for (const id of imagesIn(block)) if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

/** Every image a block refers to. */
function imagesIn(block) {
  switch (block.type) {
    case 'header':
      return [block.cover, block.logo];
    case 'image':
      return [block.image];
    case 'gallery':
      return Array.isArray(block.items) ? block.items.map((item) => item?.image) : [];
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
export function parsePageContent(input, { imageIds = new Set(), nowMs = Date.now() } = {}) {
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

  const ctx = { imageIds, nowMs, ids: new Set(), buttonIds: new Set() };
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

  const checked = parsePageContent(body.content, { imageIds, nowMs });
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
 * the button isn't one this file would accept (then it must not be shown),
 * and for buttons that download a file (see buttonFile).
 */
export function buttonLink(button) {
  const kind = BUTTON_KIND_BY_ID.get(button?.kind);
  if (!kind || kind.file) return null;
  const checked = checkButtonFields(kind, isObject(button.fields) ? button.fields : {});
  return checked.ok ? checked.destination : null;
}

/**
 * For a stored calendar or contact button: `{ type: 'ics' | 'vcf', fields }`
 * with its fields checked again, ready for lib/pageFiles.js. Null for other
 * buttons and for ones that don't pass (then it must not be shown).
 */
export function buttonFile(button) {
  const kind = BUTTON_KIND_BY_ID.get(button?.kind);
  if (!kind?.file) return null;
  // A saved event only gets nearer, so "too far ahead" isn't checked again.
  const checked = checkButtonFields(kind, isObject(button.fields) ? button.fields : {}, Infinity);
  return checked.ok ? { type: kind.file, fields: checked.content } : null;
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

// How destinations point at pages lives in lib/pageReference.js, because the
// destination checks need it too.
export { PAGE_REFERENCE_PREFIX, pageReference, pageIdFromReference, pagePath, pagePreviewPath } from './pageReference';

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
 * blocks, keptButton, nowMs }`. While it's live, `blocks` are the blocks
 * under the header that aren't hidden. Once it has ended, `blocks` is empty
 * and `keptButton` is the one button the owner chose to keep showing (or
 * null). `nowMs` is kept for what depends on the time, like "Open now".
 */
export function pageView(page, nowMs = Date.now()) {
  const all = Array.isArray(page?.content?.blocks) ? page.content.blocks : [];
  const header = all[0]?.type === 'header' ? all[0] : null;
  const rest = header ? all.slice(1) : all;
  if (!isPageEnded(page, nowMs)) {
    return { ended: false, header, blocks: rest.filter((block) => !block.hidden), keptButton: null, nowMs };
  }
  const buttons = rest.flatMap((block) => (block.type === 'buttons' && Array.isArray(block.items) ? block.items : []));
  const keptButton = page.keptButton ? buttons.find((button) => button.id === page.keptButton) ?? null : null;
  return { ended: true, header, blocks: [], keptButton, nowMs };
}

/**
 * A button visitors can see on the page at `nowMs`, or null: one in a
 * Buttons block that isn't hidden, or once the page has ended, the one kept
 * button. Calendar and contact files are only served for these.
 */
export function shownButton(page, buttonId, nowMs = Date.now()) {
  const view = pageView(page, nowMs);
  const buttons = view.ended
    ? [view.keptButton].filter(Boolean)
    : view.blocks.flatMap((block) => (block.type === 'buttons' && Array.isArray(block.items) ? block.items : []));
  return buttons.find((button) => button.id === buttonId) ?? null;
}
