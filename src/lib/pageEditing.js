/**
 * Helpers for the campaign page editor (/dashboard/pages/[id]): new blocks
 * and buttons, the fields each kind of button asks for, a page's status, and
 * moving end times between the browser's local time and the API's ISO times.
 *
 * Browser-safe, like lib/campaignPages.js, whose rules decide what a page may
 * hold; the editor checks a page with parsePageInput() before saving it.
 */

import { isPageEnded } from './campaignPages';

/** Blocks the editor offers to add (the header is always there). */
export const ADDABLE_BLOCKS = [
  { type: 'text', label: 'Text' },
  { type: 'buttons', label: 'Buttons' },
  { type: 'details', label: 'Details' },
  { type: 'offer', label: 'Offer' },
  { type: 'image', label: 'Image' },
];

/** What each block is called in the editor. */
export const BLOCK_LABELS = {
  header: 'Header',
  text: 'Text',
  image: 'Image',
  buttons: 'Buttons',
  details: 'Details',
  offer: 'Offer',
};

/**
 * The fields each kind of button asks for, in the order shown. `key` is the
 * field's name in the button's `fields` (lib/campaignPages.js BUTTON_KINDS).
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
};

/** The label a new button of each kind starts with. */
export const BUTTON_DEFAULT_LABELS = {
  link: 'Visit our website',
  call: 'Call us',
  email: 'Email us',
  whatsapp: 'WhatsApp us',
  directions: 'Get directions',
};

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
    default:
      return false;
  }
}

/** The labels of buttons that still have a template's example details. */
export function examplesLeft(content) {
  return allButtons(content)
    .filter((button) => isExample(button.kind, button.fields))
    .map((button) => button.label || 'A button');
}
