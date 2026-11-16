/**
 * Templates a new campaign page can start from: blocks already filled in
 * with example words, so the owner edits an example instead of starting
 * from nothing. Each template's content passes parsePageContent() in
 * lib/campaignPages.js (tested). Example phone numbers, email addresses and
 * links are flagged in the editor (examplesLeft in lib/pageEditing.js) until
 * they're replaced.
 */

import { CONTENT_VERSION, DEFAULT_BRAND, DEFAULT_THEME } from './campaignPages';
import { EXAMPLE_EMAIL, EXAMPLE_NUMBER, EXAMPLE_URL } from './pageEditing';

function header(title, tagline) {
  return { id: 'header', type: 'header', hidden: false, cover: null, logo: null, title, tagline };
}

const TEMPLATE_BLOCKS = {
  offer: (title) => [
    header(title, 'Say what’s on, and until when.'),
    {
      id: 'offer-1',
      type: 'offer',
      hidden: false,
      label: 'This week only',
      headline: '20% off everything',
      text: 'Show this page at the counter to claim it.',
      code: 'SAVE20',
      copyButton: true,
    },
    {
      id: 'buttons-1',
      type: 'buttons',
      hidden: false,
      items: [
        { id: 'button-1', kind: 'whatsapp', label: 'Order on WhatsApp', fields: { number: EXAMPLE_NUMBER, message: '' } },
        { id: 'button-2', kind: 'link', label: 'Visit our website', fields: { url: EXAMPLE_URL } },
      ],
    },
    {
      id: 'details-1',
      type: 'details',
      hidden: false,
      rows: [
        { icon: 'calendar', label: 'When', value: 'Mon 1 – Sun 7 December' },
        { icon: 'pin', label: 'Where', value: 'Your address' },
      ],
    },
  ],

  event: (title) => [
    header(title, 'A line about the event.'),
    {
      id: 'details-1',
      type: 'details',
      hidden: false,
      rows: [
        { icon: 'calendar', label: 'When', value: 'Saturday 6 December, 10am – 2pm' },
        { icon: 'pin', label: 'Where', value: 'Venue name and address' },
        { icon: 'tag', label: 'Tickets', value: 'Free entry' },
      ],
    },
    {
      id: 'text-1',
      type: 'text',
      hidden: false,
      text: 'Tell people what to expect, what to bring, and anything else they should know.',
    },
    {
      id: 'buttons-1',
      type: 'buttons',
      hidden: false,
      items: [
        { id: 'button-1', kind: 'link', label: 'Book your spot', fields: { url: EXAMPLE_URL } },
        { id: 'button-2', kind: 'directions', label: 'Get directions', fields: { query: 'Venue name and address' } },
      ],
    },
  ],

  contact: (title) => [
    header(title, 'What you do, in one sentence.'),
    {
      id: 'buttons-1',
      type: 'buttons',
      hidden: false,
      items: [
        { id: 'button-1', kind: 'call', label: 'Call us', fields: { number: EXAMPLE_NUMBER } },
        { id: 'button-2', kind: 'whatsapp', label: 'WhatsApp us', fields: { number: EXAMPLE_NUMBER, message: '' } },
        { id: 'button-3', kind: 'email', label: 'Email us', fields: { to: EXAMPLE_EMAIL, subject: '' } },
        { id: 'button-4', kind: 'link', label: 'Visit our website', fields: { url: EXAMPLE_URL } },
      ],
    },
    {
      id: 'details-1',
      type: 'details',
      hidden: false,
      rows: [
        { icon: 'clock', label: 'Open', value: 'Mon – Fri, 8am – 5pm' },
        { icon: 'pin', label: 'Where', value: 'Your address' },
      ],
    },
  ],

  blank: (title) => [header(title, '')],
};

/** The templates, in the order the "New page" dialog shows them. */
export const PAGE_TEMPLATES = [
  { id: 'offer', name: 'Sale or offer', description: 'An offer with a promo code, details and buttons to order.' },
  { id: 'event', name: 'Event', description: 'Date, time and place, with directions and a link to book.' },
  { id: 'contact', name: 'Contact card', description: 'A short intro and buttons to call, email or WhatsApp.' },
  { id: 'blank', name: 'Blank', description: 'Just a header. Add the blocks you need.' },
];

/** A new page's content from a template (an unknown one gives a blank page). */
export function templateContent(templateId, title) {
  const blocks = (TEMPLATE_BLOCKS[templateId] ?? TEMPLATE_BLOCKS.blank)(title);
  return { v: CONTENT_VERSION, theme: DEFAULT_THEME, brand: DEFAULT_BRAND, font: null, blocks };
}
