/**
 * Templates a new campaign page can start from: blocks already filled in,
 * so the owner edits an example instead of starting from nothing. Each
 * template's content passes parsePageContent() in lib/campaignPages.js
 * (tested).
 *
 * Anything only the owner knows (an address, a date, a price, a policy) is
 * a placeholder in square brackets, like "[Your address]", never a
 * believable made-up value: a page published by mistake then looks
 * unfinished rather than wrong, and a shop isn't held to a price it never
 * set. The editor lists every block and button that still has a
 * placeholder or an example phone number, email address or link
 * (examplesLeft in lib/pageEditing.js) until they're replaced.
 */

import { CONTENT_VERSION, DEFAULT_BRAND, DEFAULT_THEME } from './campaignPages';
import { EXAMPLE_EMAIL, EXAMPLE_NUMBER, EXAMPLE_URL, defaultHoursDays, localTimeZone } from './pageEditing';

function header(title, tagline) {
  return { id: 'header', type: 'header', hidden: false, cover: null, logo: null, title, tagline };
}

function hours(timeZone) {
  return {
    id: 'hours-1',
    type: 'hours',
    hidden: false,
    title: 'Opening hours',
    timeZone,
    days: defaultHoursDays(),
    note: '[Check these hours, then change or clear this note]',
    showStatus: true,
  };
}

function prices(id, title, items) {
  return { id, type: 'prices', hidden: false, title, items: items.map(([name, description = '', tag = '']) => ({ name, price: '[Price]', description, tag })) };
}

function details(rows) {
  return { id: 'details-1', type: 'details', hidden: false, rows: rows.map(([icon, label, value]) => ({ icon, label, value })) };
}

function buttons(items) {
  return { id: 'buttons-1', type: 'buttons', hidden: false, items: items.map((item, i) => ({ id: `button-${i + 1}`, ...item })) };
}

function faq(title, items) {
  return { id: 'faq-1', type: 'faq', hidden: false, title, items: items.map(([question, answer]) => ({ question, answer })) };
}

function text(value) {
  return { id: 'text-1', type: 'text', hidden: false, text: value };
}

const whatsapp = (label, message = '') => ({ kind: 'whatsapp', label, fields: { number: EXAMPLE_NUMBER, message } });
const call = (label) => ({ kind: 'call', label, fields: { number: EXAMPLE_NUMBER } });

const TEMPLATE_BLOCKS = {
  offer: (title) => [
    header(title, '[Say what’s on, and until when]'),
    {
      id: 'offer-1',
      type: 'offer',
      hidden: false,
      label: 'This week only',
      headline: '[20% off everything]',
      text: 'Show this page at the counter to claim it.',
      code: '[SAVE20]',
      copyButton: true,
    },
    buttons([whatsapp('Order on WhatsApp'), { kind: 'link', label: 'Visit our website', fields: { url: EXAMPLE_URL } }]),
    details([
      ['calendar', 'When', '[Dates]'],
      ['pin', 'Where', '[Your address]'],
    ]),
  ],

  event: (title) => [
    header(title, '[A line about the event]'),
    details([
      ['calendar', 'When', '[Day, date and time]'],
      ['pin', 'Where', '[Venue and address]'],
      ['tag', 'Tickets', '[Free entry, or the ticket price]'],
    ]),
    text('[Tell people what to expect, what to bring, and anything else they should know.]'),
    buttons([
      { kind: 'link', label: 'Book your spot', fields: { url: EXAMPLE_URL } },
      { kind: 'directions', label: 'Get directions', fields: { query: '[Venue and address]' } },
    ]),
  ],

  menu: (title, { timeZone }) => [
    header(title, '[What you serve, in one line]'),
    prices('prices-1', 'Coffee', [['Flat white', 'A double shot, with any milk'], ['Cappuccino', '', 'Popular'], ['Americano']]),
    prices('prices-2', 'Breakfast', [['Eggs on sourdough', 'Two eggs, any style'], ['Granola bowl', 'With yoghurt and fresh fruit', 'Vegan option'], ['Toast and jam']]),
    hours(timeZone),
    buttons([whatsapp('Order on WhatsApp'), { kind: 'directions', label: 'Get directions', fields: { query: '[Your address]' } }]),
    faq('Questions', [
      ['Can I book a table?', '[Yes or no, and how to book]'],
      ['Do you have vegan options?', '[What you have for vegans]'],
    ]),
  ],

  contact: (title, { timeZone }) => [
    header(title, '[What you do, in one sentence]'),
    buttons([
      call('Call us'),
      whatsapp('WhatsApp us'),
      { kind: 'email', label: 'Email us', fields: { to: EXAMPLE_EMAIL, subject: '' } },
      { kind: 'link', label: 'Visit our website', fields: { url: EXAMPLE_URL } },
      {
        kind: 'contact',
        label: 'Save our contact',
        fields: { name: title, organisation: '', phone: EXAMPLE_NUMBER, email: EXAMPLE_EMAIL, website: EXAMPLE_URL, address: '' },
      },
    ]),
    hours(timeZone),
    details([['pin', 'Where', '[Your address]']]),
  ],

  property: (title) => [
    header(title, '[Price] · [Suburb]'),
    // Empty, so it isn't shown until the owner adds photos.
    { id: 'gallery-1', type: 'gallery', hidden: false, items: [] },
    details([
      ['tag', 'Price', '[Price]'],
      ['info', 'The home', '[Bedrooms, bathrooms and floor size]'],
      ['pin', 'Where', '[Suburb and town]'],
      ['calendar', 'Show day', '[Day and time, or “By appointment”]'],
    ]),
    buttons([
      whatsapp('WhatsApp the agent', 'Hi! I saw your board and I’d like to know more about the property.'),
      call('Call the agent'),
      {
        kind: 'contact',
        label: 'Save the agent’s contact',
        fields: { name: '[Agent’s name]', organisation: '[Agency]', phone: EXAMPLE_NUMBER, email: EXAMPLE_EMAIL, website: '', address: '' },
      },
    ]),
    text('## About the home\n\n[A few lines about what makes it special: the garden, the view, what’s nearby.]'),
  ],

  guest: (title) => [
    header(title, 'Welcome! Everything you need for your stay.'),
    details([
      ['clock', 'Check-in', '[From 14:00]'],
      ['clock', 'Check-out', '[By 10:00]'],
      ['info', 'Wi-Fi', '[Network name] · password [password]'],
    ]),
    buttons([whatsapp('WhatsApp your host'), call('Call your host')]),
    faq('Good to know', [
      ['Where do I park?', '[Where guests can park]'],
      ['Can I use the braai?', '[Yes or no, and where to find wood]'],
      ['What if the power goes off?', '[What to do during load-shedding]'],
      ['Where do I leave the keys?', '[Where the keys go when you leave]'],
    ]),
    text(
      '## Nearby\n\n- [A café or restaurant you like]\n- [The nearest shop]\n\nIn an emergency, call 10111 for the police or 10177 for an ambulance, or 112 from a cell phone.'
    ),
  ],

  blank: (title) => [header(title, '')],
};

/** The templates, in the order the "New page" dialog shows them. */
export const PAGE_TEMPLATES = [
  { id: 'offer', name: 'Sale or offer', description: 'An offer with a promo code, details and buttons to order.' },
  { id: 'event', name: 'Event', description: 'Date, time and place, with directions and a link to book.' },
  { id: 'menu', name: 'Menu or price list', description: 'Prices in sections, opening hours, questions and a button to order.' },
  { id: 'contact', name: 'Contact card', description: 'Buttons to call, email or WhatsApp, a contact to save, and your hours.' },
  { id: 'property', name: 'Property listing', description: 'For a show board: photos, the main facts, and the agent’s details.' },
  { id: 'guest', name: 'Guest welcome', description: 'For a guesthouse or rental: check-in, Wi-Fi, house questions and the host’s number.' },
  { id: 'blank', name: 'Blank', description: 'Just a header. Add the blocks you need.' },
];

/**
 * A new page's content from a template (an unknown one gives a blank page).
 * Opening hours are on the clock in `timeZone`, the browser's own by default.
 */
export function templateContent(templateId, title, { timeZone = localTimeZone() } = {}) {
  const blocks = (TEMPLATE_BLOCKS[templateId] ?? TEMPLATE_BLOCKS.blank)(title, { timeZone });
  return { v: CONTENT_VERSION, theme: DEFAULT_THEME, brand: DEFAULT_BRAND, font: null, blocks };
}
