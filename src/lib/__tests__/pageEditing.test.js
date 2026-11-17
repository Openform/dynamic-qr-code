import { describe, it, expect } from 'vitest';
import { parsePageContent, parsePageInput } from '../campaignPages';
import { PAGE_TEMPLATES, templateContent } from '../pageTemplates';
import {
  ADDABLE_BLOCKS,
  BUTTON_FIELDS,
  freshId,
  newBlock,
  newButton,
  allButtons,
  move,
  pageStatus,
  isoToLocalInput,
  localInputToIso,
  examplesLeft,
} from '../pageEditing';
import { BUTTON_KINDS } from '../campaignPages';

describe('templates', () => {
  it('each make a page that passes the checks, titled with its name', () => {
    for (const template of PAGE_TEMPLATES) {
      const content = templateContent(template.id, 'Spring menu');
      const checked = parsePageContent(content);
      expect(checked.ok, `${template.id}: ${checked.error}`).toBe(true);
      expect(checked.content.blocks[0]).toMatchObject({ type: 'header', title: 'Spring menu' });
    }
  });

  it('flag their example details until they’re replaced', () => {
    expect(examplesLeft(templateContent('contact', 'Us'))).toEqual(['Call us', 'WhatsApp us', 'Email us', 'Visit our website', 'Save our contact']);
    expect(examplesLeft(templateContent('menu', 'Us'))).toEqual(['Order on WhatsApp']);
    expect(examplesLeft(templateContent('blank', 'Us'))).toEqual([]);

    const content = templateContent('offer', 'Sale');
    content.blocks[2].items[0].fields.number = '+27 82 123 4567';
    content.blocks[2].items[1].fields.url = 'https://cakes.co.za';
    expect(examplesLeft(content)).toEqual([]);
  });

  it('falls back to a blank page for an unknown template', () => {
    expect(templateContent('nope', 'X').blocks).toHaveLength(1);
  });
});

describe('new blocks and buttons', () => {
  const page = () => templateContent('offer', 'Sale');

  it('get ids that aren’t used yet', () => {
    expect(freshId(page(), 'buttons')).toBe('buttons-2');
    expect(freshId(page(), 'button')).toBe('button-3');
    expect(freshId(page(), 'text')).toBe('text-1');
  });

  it('start empty, so the checks ask for what’s missing', () => {
    for (const { type } of ADDABLE_BLOCKS) {
      const content = page();
      const block = newBlock(content, type);
      expect(block.type).toBe(type);
      content.blocks.push(block);
      // Ids never clash, even a new Buttons block's first button.
      const ids = content.blocks.flatMap((b) => [b.id, ...(b.items ?? []).map((i) => i.id)]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const withText = page();
    withText.blocks.push(newBlock(withText, 'text'));
    expect(parsePageContent(withText)).toMatchObject({ ok: false, path: 'blocks.4.text', error: 'Enter the text.' });
  });

  it('starts opening hours and galleries ready to save, and lists ready to fill in', () => {
    for (const type of ['hours', 'gallery']) {
      const content = page();
      content.blocks.push(newBlock(content, type));
      expect(parsePageContent(content).ok, type).toBe(true);
    }
    const hours = newBlock(page(), 'hours');
    expect(hours.days.map((day) => day.periods.length)).toEqual([1, 1, 1, 1, 1, 1, 0]);
    expect(Intl.DateTimeFormat('en-US', { timeZone: hours.timeZone })).toBeTruthy();
    for (const [type, path] of [['faq', 'items.0.question'], ['prices', 'items.0.name']]) {
      const content = page();
      content.blocks.push(newBlock(content, type));
      expect(parsePageContent(content)).toMatchObject({ ok: false, path: `blocks.4.${path}` });
    }
  });

  it('has fields for every kind of button', () => {
    expect(Object.keys(BUTTON_FIELDS).sort()).toEqual(BUTTON_KINDS.map((k) => k.id).sort());
    const button = newButton(page(), 'whatsapp');
    expect(button).toEqual({ id: 'button-3', kind: 'whatsapp', label: 'WhatsApp us', fields: { number: '', message: '' } });
  });

  it('lists every button, for the one to keep after the end', () => {
    expect(allButtons(templateContent('contact', 'Us')).map((b) => b.id)).toEqual(['button-1', 'button-2', 'button-3', 'button-4', 'button-5']);
  });

  it('moves items up and down, and not past either end', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(move(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('pageStatus', () => {
  const NOW = Date.parse('2026-11-16T12:00:00Z');
  it('puts taken down, then off, then ended, then live', () => {
    expect(pageStatus({ takenDown: true, published: true }, NOW).id).toBe('taken-down');
    expect(pageStatus({ takenDown: false, published: false }, NOW).id).toBe('off');
    expect(pageStatus({ published: true, endsAt: '2026-11-01T00:00:00Z', afterEnd: 'ended' }, NOW).id).toBe('ended');
    expect(pageStatus({ published: true, endsAt: '2026-11-01T00:00:00Z', afterEnd: 'keep' }, NOW).id).toBe('live');
    expect(pageStatus({ published: true, endsAt: null }, NOW)).toEqual({ id: 'live', label: 'Live' });
  });
});

describe('end times', () => {
  it('go between the browser’s local time and ISO times', () => {
    const iso = localInputToIso('2026-11-30T16:00');
    expect(isoToLocalInput(iso)).toBe('2026-11-30T16:00');
    expect(localInputToIso('')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
    // What the editor sends passes the same check the server makes.
    const checked = parsePageInput(
      { name: 'Sale', content: templateContent('blank', 'Sale'), endsAt: iso },
      { nowMs: Date.parse('2026-11-16T00:00:00Z') }
    );
    expect(checked.ok).toBe(true);
  });
});
