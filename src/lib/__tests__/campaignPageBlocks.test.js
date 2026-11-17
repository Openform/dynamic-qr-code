/**
 * The newer campaign page blocks (FAQ, Opening hours, Price list, Gallery)
 * and buttons (Add to calendar, Save contact): what lib/campaignPages.js
 * accepts, how it cleans them, and where it says the problem is.
 */

import { describe, it, expect } from 'vitest';
import { PAGE_LIMITS, buttonFile, buttonLink, imageIdsInContent, parsePageContent, parsePageInput, shownButton } from '../campaignPages';

const NOW = Date.parse('2026-11-16T10:00:00Z');

function header() {
  return { id: 'header', type: 'header', cover: null, logo: null, title: 'Bean There', tagline: '' };
}

function page(...blocks) {
  return { theme: 'fresh', brand: '#1F6F4A', font: null, blocks: [header(), ...blocks] };
}

const week = (periods) => Array.from({ length: 7 }, () => ({ periods }));

function hoursBlock(change = {}) {
  return { id: 'hours', type: 'hours', title: 'Opening hours', timeZone: 'Africa/Johannesburg', days: week([{ open: '08:00', close: '17:00' }]), note: '', ...change };
}

function check(...blocks) {
  return parsePageContent(page(...blocks), { imageIds: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), nowMs: NOW });
}

const buttons = (...items) => ({ id: 'buttons', type: 'buttons', items });

describe('FAQ blocks', () => {
  it('keep a heading and questions with their answers', () => {
    const checked = check({
      id: 'faq',
      type: 'faq',
      title: ' Questions ',
      items: [{ question: ' Do you deliver? ', answer: 'Yes, within **10 km**.\r\nFrom R40.' }],
      extra: 'dropped',
    });
    expect(checked.ok).toBe(true);
    expect(checked.content.blocks[1]).toEqual({
      id: 'faq',
      type: 'faq',
      hidden: false,
      title: 'Questions',
      items: [{ question: 'Do you deliver?', answer: 'Yes, within **10 km**.\nFrom R40.' }],
    });
  });

  it('need a question and an answer in each item, and at least one item', () => {
    expect(check({ id: 'faq', type: 'faq', items: [] })).toMatchObject({ ok: false, path: 'blocks.1.items' });
    expect(check({ id: 'faq', type: 'faq', items: [{ question: 'Open late?', answer: ' ' }] })).toMatchObject({
      ok: false,
      path: 'blocks.1.items.0.answer',
    });
    const many = Array.from({ length: PAGE_LIMITS.faqItems + 1 }, () => ({ question: 'Q', answer: 'A' }));
    expect(check({ id: 'faq', type: 'faq', items: many })).toMatchObject({ ok: false, path: 'blocks.1.items' });
  });
});

describe('Opening hours blocks', () => {
  it('keep a time zone, a day for each day of the week, a note and the status setting', () => {
    const days = [
      { periods: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }] },
      ...week([{ open: '08:00', close: '17:00' }]).slice(1, 5),
      { periods: [{ open: '18:00', close: '02:00' }] },
      { periods: [] },
    ];
    const checked = check(hoursBlock({ days, note: 'Closed on public holidays' }));
    expect(checked.ok).toBe(true);
    expect(checked.content.blocks[1]).toMatchObject({ timeZone: 'Africa/Johannesburg', note: 'Closed on public holidays', showStatus: true });
    expect(checked.content.blocks[1].days).toEqual(days);
    expect(check(hoursBlock({ showStatus: false })).content.blocks[1].showStatus).toBe(false);
  });

  it('need all seven days, real times, at most two times a day, and a time zone', () => {
    expect(check(hoursBlock({ days: week([]).slice(0, 6) }))).toMatchObject({ ok: false, path: 'blocks.1.days' });
    const days = week([{ open: '08:00', close: '17:00' }]);
    days[2] = { periods: [{ open: '08:00', close: '25:00' }] };
    expect(check(hoursBlock({ days }))).toMatchObject({ ok: false, path: 'blocks.1.days.2.periods.0.close', error: 'Enter when it closes.' });
    days[2] = { periods: [{ open: '', close: '17:00' }] };
    expect(check(hoursBlock({ days }))).toMatchObject({ ok: false, path: 'blocks.1.days.2.periods.0.open' });
    days[2] = { periods: Array.from({ length: 3 }, () => ({ open: '08:00', close: '09:00' })) };
    expect(check(hoursBlock({ days }))).toMatchObject({ ok: false, path: 'blocks.1.days.2' });
    expect(check(hoursBlock({ timeZone: 'Mars/Olympus' }))).toMatchObject({ ok: false, path: 'blocks.1.timeZone' });
  });
});

describe('Price list blocks', () => {
  it('keep a heading and items with a name, price, description and tag', () => {
    const checked = check({ id: 'coffee', type: 'prices', title: 'Coffee', items: [{ name: 'Flat white', price: ' R38 ', description: 'Double shot', tag: 'New' }, { name: 'Americano' }] });
    expect(checked.ok).toBe(true);
    expect(checked.content.blocks[1].items).toEqual([
      { name: 'Flat white', price: 'R38', description: 'Double shot', tag: 'New' },
      { name: 'Americano', price: '', description: '', tag: '' },
    ]);
  });

  it('need a name for each item, and at most 30 items', () => {
    expect(check({ id: 'p', type: 'prices', items: [{ price: 'R10' }] })).toMatchObject({ ok: false, path: 'blocks.1.items.0.name' });
    const many = Array.from({ length: PAGE_LIMITS.priceItems + 1 }, () => ({ name: 'Tea' }));
    expect(check({ id: 'p', type: 'prices', items: many })).toMatchObject({ ok: false, path: 'blocks.1.items' });
    expect(check({ id: 'p', type: 'prices', items: [{ name: 'Tea', price: 'R'.repeat(PAGE_LIMITS.price + 1) }] })).toMatchObject({
      ok: false,
      path: 'blocks.1.items.0.price',
    });
  });
});

describe('Gallery blocks', () => {
  it('keep the page’s own photos with what they show, and count them as shown', () => {
    const checked = check({ id: 'gallery', type: 'gallery', items: [{ image: 1, alt: 'The counter' }, { image: 2 }] });
    expect(checked.ok).toBe(true);
    expect(checked.content.blocks[1].items).toEqual([
      { image: 1, alt: 'The counter' },
      { image: 2, alt: '' },
    ]);
    expect([...imageIdsInContent(checked.content)]).toEqual([1, 2]);
  });

  it('can be empty while photos are being added', () => {
    expect(check({ id: 'gallery', type: 'gallery', items: [] }).ok).toBe(true);
  });

  it('refuse photos that aren’t the page’s, gaps, and more than 8', () => {
    expect(check({ id: 'g', type: 'gallery', items: [{ image: 99 }] })).toMatchObject({ ok: false, path: 'blocks.1.items.0.image' });
    expect(check({ id: 'g', type: 'gallery', items: [{ image: 1 }, { image: null }] })).toMatchObject({ ok: false, path: 'blocks.1.items.1.image' });
    const nine = Array.from({ length: 9 }, (_, i) => ({ image: i + 1 }));
    expect(check({ id: 'g', type: 'gallery', items: nine })).toMatchObject({ ok: false, path: 'blocks.1.items' });
  });
});

describe('Add to calendar buttons', () => {
  const event = (fields) => ({ id: 'b-cal', kind: 'calendar', label: 'Add to calendar', fields });

  it('keep an event with its times as ISO, and download a file instead of opening a link', () => {
    const checked = check(
      buttons(event({ title: 'Summer market', startsAt: '2026-12-06T10:00+02:00', endsAt: '2026-12-06T14:00:00+02:00', location: 'The Old Mill', details: 'Bring a blanket\r\nand a friend' }))
    );
    expect(checked.ok).toBe(true);
    const button = checked.content.blocks[1].items[0];
    expect(button.fields).toEqual({
      title: 'Summer market',
      startsAt: '2026-12-06T08:00:00.000Z',
      endsAt: '2026-12-06T12:00:00.000Z',
      location: 'The Old Mill',
      details: 'Bring a blanket\nand a friend',
    });
    expect(buttonLink(button)).toBeNull();
    expect(buttonFile(button)).toEqual({ type: 'ics', fields: button.fields });
  });

  it('need a name and a start, an end after the start, and no more than 5 years ahead', () => {
    expect(check(buttons(event({ startsAt: '2026-12-06T08:00:00Z' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.title' });
    expect(check(buttons(event({ title: 'Market', startsAt: 'next Saturday' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.startsAt' });
    expect(check(buttons(event({ title: 'Market', startsAt: '2026-12-06T08:00:00Z', endsAt: '2026-12-06T07:00:00Z' })))).toMatchObject({
      ok: false,
      path: 'blocks.1.items.0.fields.endsAt',
    });
    expect(check(buttons(event({ title: 'Market', startsAt: '2032-12-06T08:00:00Z' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.startsAt' });
  });

  it('can be the button kept after the page ends', () => {
    const body = {
      name: 'Market',
      content: page(buttons(event({ title: 'Next market', startsAt: '2027-01-10T08:00:00Z' }))),
      endsAt: '2026-12-07T00:00:00Z',
      afterEnd: 'ended',
      keptButton: 'b-cal',
    };
    expect(parsePageInput(body, { nowMs: NOW })).toMatchObject({ ok: true, page: { keptButton: 'b-cal' } });
  });
});

describe('Save contact buttons', () => {
  const contact = (fields) => ({ id: 'b-card', kind: 'contact', label: 'Save our contact', fields });

  it('keep a name and ways to get in touch, cleaned like the other buttons’ fields', () => {
    const checked = check(buttons(contact({ name: 'Thandi Mokoena', organisation: 'Bean There', phone: '082 123 4567', email: 'thandi@example.com', website: 'example.com', address: 'Shop 4' })));
    expect(checked.ok).toBe(true);
    const button = checked.content.blocks[1].items[0];
    expect(button.fields).toEqual({
      name: 'Thandi Mokoena',
      organisation: 'Bean There',
      phone: '0821234567',
      email: 'thandi@example.com',
      website: 'https://example.com',
      address: 'Shop 4',
    });
    expect(buttonLink(button)).toBeNull();
    expect(buttonFile(button)).toMatchObject({ type: 'vcf' });
  });

  it('need a name and at least one of a phone number, email address or website', () => {
    expect(check(buttons(contact({ phone: '0821234567' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.name' });
    expect(check(buttons(contact({ name: 'Thandi' })))).toMatchObject({
      ok: false,
      path: 'blocks.1.items.0.fields.phone',
      error: 'Add a phone number, email address or website.',
    });
    expect(check(buttons(contact({ name: 'Thandi', email: 'not an email' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.email' });
    expect(check(buttons(contact({ name: 'Thandi', website: 'http://example.com' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.website' });
    expect(check(buttons(contact({ name: 'Thandi', website: 'qrgo-page:4' })))).toMatchObject({ ok: false, path: 'blocks.1.items.0.fields.website' });
  });

  it('aren’t turned into files when what’s stored wouldn’t pass', () => {
    expect(buttonFile({ id: 'x', kind: 'contact', fields: { name: 'Thandi' } })).toBeNull();
    expect(buttonFile({ id: 'x', kind: 'call', fields: { number: '0821234567' } })).toBeNull();
    expect(buttonFile(null)).toBeNull();
  });
});

describe('shownButton', () => {
  const content = (hidden = false) =>
    parsePageContent(
      page(
        { ...buttons({ id: 'b-cal', kind: 'calendar', label: 'Add', fields: { title: 'Market', startsAt: '2027-01-10T08:00:00Z' } }), hidden },
        { id: 'more', type: 'buttons', items: [{ id: 'b-call', kind: 'call', label: 'Call', fields: { number: '0215550100' } }] }
      ),
      { nowMs: NOW }
    ).content;

  it('finds a button visitors can see', () => {
    expect(shownButton({ content: content(), endsAt: null }, 'b-cal', NOW)).toMatchObject({ id: 'b-cal' });
    expect(shownButton({ content: content(), endsAt: null }, 'nope', NOW)).toBeNull();
  });

  it('leaves out buttons in hidden blocks, and all but the kept one once the page has ended', () => {
    expect(shownButton({ content: content(true), endsAt: null }, 'b-cal', NOW)).toBeNull();
    const ended = { content: content(), endsAt: '2026-11-01 00:00:00', afterEnd: 'ended', keptButton: 'b-cal' };
    expect(shownButton(ended, 'b-cal', NOW)).toMatchObject({ id: 'b-cal' });
    expect(shownButton(ended, 'b-call', NOW)).toBeNull();
  });
});
