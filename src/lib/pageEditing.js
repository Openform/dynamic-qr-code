/**
 * Helpers for the campaign page editor (/dashboard/pages/[id]): new blocks
 * and buttons, the fields each kind of button asks for, a page's status, and
 * moving end times between the browser's local time and the API's ISO times.
 *
 * Browser-safe, like lib/campaignPages.js, whose rules decide what a page may
 * hold; the editor checks a page with parsePageInput() before saving it.
 */

import { isPageEnded } from './campaignPages';
import { isValidTimeZone } from './scheduleInput';

/** Blocks the editor offers to add (the header is always there). */
export const ADDABLE_BLOCKS = [
  { type: 'text', label: 'Text' },
  { type: 'buttons', label: 'Buttons' },
  { type: 'details', label: 'Details' },
  { type: 'offer', label: 'Offer' },
  { type: 'image', label: 'Image' },
  { type: 'gallery', label: 'Gallery' },
  { type: 'faq', label: 'FAQ' },
  { type: 'hours', label: 'Opening hours' },
  { type: 'prices', label: 'Price list' },
];

/** What each block is called in the editor. */
export const BLOCK_LABELS = {
  header: 'Header',
  text: 'Text',
  image: 'Image',
  buttons: 'Buttons',
  details: 'Details',
  offer: 'Offer',
  faq: 'FAQ',
  hours: 'Opening hours',
  prices: 'Price list',
  gallery: 'Gallery',
};

/**
 * The fields each kind of button asks for, in the order shown. `key` is the
 * field's name in the button's `fields` (lib/campaignPages.js BUTTON_KINDS).
 * `time` fields hold an ISO time and are edited in the browser's local time.
 */
export const BUTTON_FIELDS = {
  link: [{ key: 'url', label: 'Web address', placeholder: 'example.com/menu', prefix: 'https://' }],
  call: [{ key: 'number', label: 'Phone number', placeholder: '021 555 0100', type: 'tel' }],
  email: [
    { key: 'to', label: 'Email address', placeholder: 'hello@example.com', type: 'email' },
    { key: 'subject', label: 'Subject (optional)', placeholder: 'Cake order' },
  ],
  whatsapp: [
    { key: 'number', label: 'WhatsApp number, with the country code', placeholder: '+27 82 123 4567', type: 'tel' },
    { key: 'message', label: 'Message to start with (optional)', placeholder: 'Hi! I’d like to order…', multiline: true },
  ],
  directions: [{ key: 'query', label: 'Address or place', placeholder: 'Shop 4, The Old Mill, Woodstock' }],
  calendar: [
    { key: 'title', label: 'Event name', placeholder: 'Summer market' },
    { key: 'startsAt', label: 'Starts', type: 'datetime-local', time: true },
    { key: 'endsAt', label: 'Ends (optional)', type: 'datetime-local', time: true },
    { key: 'location', label: 'Place (optional)', placeholder: 'The Old Mill, Woodstock' },
    { key: 'details', label: 'Details (optional)', placeholder: 'Bring a blanket!', multiline: true },
  ],
  contact: [
    { key: 'name', label: 'Name', placeholder: 'Thandi Mokoena, or your business’s name' },
    { key: 'organisation', label: 'Business (optional)', placeholder: 'Bean There Café' },
    { key: 'phone', label: 'Phone number', placeholder: '021 555 0100', type: 'tel' },
    { key: 'email', label: 'Email address', placeholder: 'hello@example.com', type: 'email' },
    { key: 'website', label: 'Website', placeholder: 'example.com' },
    { key: 'address', label: 'Address (optional)', placeholder: 'Shop 4, The Old Mill, Woodstock' },
  ],
};

/** The label a new button of each kind starts with. */
export const BUTTON_DEFAULT_LABELS = {
  link: 'Visit our website',
  call: 'Call us',
  email: 'Email us',
  whatsapp: 'WhatsApp us',
  directions: 'Get directions',
  calendar: 'Add to calendar',
  contact: 'Save our contact',
};

export const DEFAULT_TIME_ZONE = 'Africa/Johannesburg';

/** The browser's time zone, e.g. "Africa/Johannesburg", or South Africa's when it can't be read. */
export function localTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** A day's opening times: closed, or open from `open` to `close`. */
export function hoursDay(open = null, close = null) {
  return { periods: open ? [{ open, close }] : [] };
}

/** The hours a new Opening hours block starts with: weekdays, Saturday morning, closed Sunday. */
export function defaultHoursDays() {
  return [
    ...Array.from({ length: 5 }, () => hoursDay('08:00', '17:00')),
    hoursDay('09:00', '13:00'),
    hoursDay(),
  ];
}

/** Every block and button id in use on a page. */
function idsIn(content) {
  const ids = new Set();
  for (const block of content?.blocks ?? []) {
    ids.add(block.id);
    for (const button of block.items ?? []) ids.add(button.id);
  }
  return ids;
}

/** An id like "text-2" that isn't used anywhere on the page yet. */
export function freshId(content, prefix) {
  const ids = idsIn(content);
  let n = 1;
  while (ids.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

/** The fields a new button of `kind` starts with (empty, for the owner to fill in). */
function emptyFields(kind) {
  return Object.fromEntries((BUTTON_FIELDS[kind] ?? []).map((field) => [field.key, '']));
}

/** A new button for this page. */
export function newButton(content, kind = 'link') {
  return { id: freshId(content, 'button'), kind, label: BUTTON_DEFAULT_LABELS[kind] ?? '', fields: emptyFields(kind) };
}

/** A new, empty block of `type` for this page. */
export function newBlock(content, type) {
  const base = { id: freshId(content, type), type, hidden: false };
  switch (type) {
    case 'text':
      return { ...base, text: '' };
    case 'image':
      return { ...base, image: null, alt: '', caption: '', link: '' };
    case 'buttons':
      // The button's id must not clash with the block's own.
      return { ...base, items: [newButton({ blocks: [...(content?.blocks ?? []), base] })] };
    case 'details':
      return { ...base, rows: [{ icon: 'calendar', label: '', value: '' }] };
    case 'offer':
      return { ...base, label: '', headline: '', text: '', code: '', copyButton: true };
    case 'faq':
      return { ...base, title: 'Questions', items: [{ question: '', answer: '' }] };
    case 'hours':
      return { ...base, title: 'Opening hours', timeZone: localTimeZone(), days: defaultHoursDays(), note: '', showStatus: true };
    case 'prices':
      return { ...base, title: '', items: [{ name: '', price: '', description: '', tag: '' }] };
    case 'gallery':
      return { ...base, items: [] };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}

/** Every button on the page, with the block it's in, for "Button to keep". */
export function allButtons(content) {
  return (content?.blocks ?? []).flatMap((block) =>
    block.type === 'buttons' ? (block.items ?? []).map((button) => ({ ...button, blockId: block.id })) : []
  );
}

/** `items` with the one at `index` moved by `step` (−1 up, +1 down). */
export function move(items, index, step) {
  const to = index + step;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * A page's status for lists and the editor: `{ id, label }`, id being
 * 'taken-down', 'off', 'ended' or 'live'.
 */
export function pageStatus(page, nowMs = Date.now()) {
  if (page.takenDown) return { id: 'taken-down', label: 'Taken down' };
  if (!page.published) return { id: 'off', label: 'Off' };
  if (isPageEnded(page, nowMs)) return { id: 'ended', label: 'Ended' };
  return { id: 'live', label: 'Live' };
}

/** An ISO time → the "YYYY-MM-DDTHH:MM" local time a datetime-local input holds ('' for none). */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (the browser's local time) → an ISO time, or null for none. */
export function localInputToIso(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// The example details templates start with (lib/pageTemplates.js).
export const EXAMPLE_NUMBER = '+27 00 000 0000';
export const EXAMPLE_EMAIL = 'hello@example.com';
export const EXAMPLE_URL = 'https://example.com';

function isExample(kind, fields) {
  const digits = (value) => String(value ?? '').replace(/\D/g, '');
  switch (kind) {
    case 'link':
      return /^(https:\/\/)?([a-z0-9-]+\.)*example\.com(\/|$)/i.test(String(fields?.url ?? ''));
    case 'call':
    case 'whatsapp':
      return digits(fields?.number) === digits(EXAMPLE_NUMBER);
    case 'email':
      return /@example\.com$/i.test(String(fields?.to ?? ''));
    case 'contact':
      return (
        (Boolean(fields?.phone) && digits(fields.phone) === digits(EXAMPLE_NUMBER)) ||
        /@example\.com$/i.test(String(fields?.email ?? '')) ||
        isExample('link', { url: fields?.website })
      );
    default:
      return false;
  }
}

// A template's placeholder: words in square brackets, like "[Your address]",
// that aren't the start of a Markdown link ("[our menu](https://…)").
const PLACEHOLDER = /\[[^[\]\n]+\](?!\()/;

/** True when `value` (text, or any text inside an object or list) still has a placeholder. */
export function hasPlaceholder(value) {
  if (typeof value === 'string') return PLACEHOLDER.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object') return Object.values(value).some(hasPlaceholder);
  return false;
}

/** A block's name for a list: "Details", or "Price list “Coffee”" when it has a heading. */
function blockName(block) {
  const label = BLOCK_LABELS[block.type] ?? block.type;
  return block.type !== 'header' && block.title && block.title !== label ? `${label} “${block.title}”` : label;
}

/**
 * What still has a template's examples, for the editor to list before the
 * page is shared: `[{ blockId, label }]`, one for each button with an
 * example phone number, email address or link or a placeholder, and one for
 * each other block with a placeholder.
 */
export function examplesLeft(content) {
  const found = [];
  for (const block of content?.blocks ?? []) {
    if (block.type === 'buttons') {
      for (const button of block.items ?? []) {
        if (isExample(button.kind, button.fields) || hasPlaceholder(button.label) || hasPlaceholder(button.fields)) {
          found.push({ blockId: block.id, label: button.label || 'A button' });
        }
      }
    } else if (hasPlaceholder(block)) {
      found.push({ blockId: block.id, label: blockName(block) });
    }
  }
  return found;
}

/** The editor's tabs, in order: the blocks, the look, and the page's settings. */
export const EDITOR_TABS = ['content', 'design', 'settings'];

const DESIGN_FIELDS = new Set(['theme', 'brand', 'font', 'bodyFont', 'textSize', 'headingSize']);
const SETTINGS_FIELDS = new Set(['name', 'endsAt', 'afterEnd', 'keptButton']);

/**
 * The editor tab with the field a check's error `path` points at (see
 * parsePageInput in lib/campaignPages.js), or null when it isn't one field.
 */
export function editorTabFor(path) {
  const field = typeof path === 'string' ? path.split('.')[0] : null;
  if (field === 'blocks') return 'content';
  if (DESIGN_FIELDS.has(field)) return 'design';
  if (SETTINGS_FIELDS.has(field)) return 'settings';
  return null;
}
