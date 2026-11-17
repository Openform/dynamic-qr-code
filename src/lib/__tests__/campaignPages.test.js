import { describe, it, expect } from 'vitest';
import {
  PAGE_LIMITS,
  CONTENT_VERSION,
  parsePageContent,
  parsePageInput,
  checkPageName,
  newPageContent,
  buttonLink,
  pickTextColor,
  pageReference,
  pageIdFromReference,
  pagePath,
  isPageEnded,
  pageView,
} from '../campaignPages';

const NOW = Date.parse('2026-11-16T10:00:00Z');

/** A page using every kind of block, as the editor would send it. */
function samplePage() {
  return {
    theme: 'fresh',
    brand: '#1f6f4a',
    font: null,
    blocks: [
      { id: 'header', type: 'header', cover: null, logo: null, title: '  Black Friday weekend ', tagline: '20% off every whole cake' },
      { id: 'offer', type: 'offer', label: 'This weekend only', headline: '20% off all whole cakes', text: 'Show this code\r\nat the counter.', code: 'FRIDAY20', copyButton: true },
      { id: 'about', type: 'text', text: 'Order ahead and **skip the queue**.\n\n- Chocolate\n- Carrot' },
      {
        id: 'contact',
        type: 'buttons',
        items: [
          { id: 'b-wa', kind: 'whatsapp', label: 'Order on WhatsApp', fields: { number: '+27 82 123 4567', message: 'Hi!' } },
          { id: 'b-call', kind: 'call', label: 'Call the shop', fields: { number: '021 555 0100' } },
          { id: 'b-map', kind: 'directions', label: 'Get directions', fields: { query: 'Shop 4, The Old Mill' } },
          { id: 'b-menu', kind: 'link', label: 'See our full menu', fields: { url: 'example.com/menu' } },
          { id: 'b-mail', kind: 'email', label: 'Email us', fields: { to: 'hello@example.com', subject: 'Cake order' } },
        ],
      },
      {
        id: 'details',
        type: 'details',
        rows: [
          { icon: 'calendar', label: 'When', value: 'Fri 27 – Mon 30 November' },
          { icon: 'clock', label: 'Open', value: '8am – 4pm every day' },
          { icon: 'pin', label: 'Where', value: 'Shop 4, The Old Mill' },
        ],
      },
      { id: 'photo', type: 'image', image: null, alt: 'The cake counter', caption: 'Every cake is 20% off.', link: '' },
    ],
  };
}

/** The sample with one block replaced or changed. */
function withBlock(index, change) {
  const page = samplePage();
  page.blocks[index] = typeof change === 'function' ? change(page.blocks[index]) : change;
  return page;
}

describe('parsePageContent', () => {
  it('accepts a page with every kind of block and cleans it', () => {
    const checked = parsePageContent(samplePage());
    expect(checked.ok).toBe(true);
    const { content } = checked;
    expect(content.v).toBe(CONTENT_VERSION);
    expect(content.brand).toBe('#1F6F4A');
    expect(content.blocks.map((b) => b.type)).toEqual(['header', 'offer', 'text', 'buttons', 'details', 'image']);
    expect(content.blocks[0].title).toBe('Black Friday weekend');
    expect(content.blocks[1].text).toBe('Show this code\nat the counter.');
    // Phone numbers and links come back in the shape the code-type builders store.
    const buttons = content.blocks[3].items;
    expect(buttons[0].fields).toEqual({ number: '+27821234567', message: 'Hi!' });
    expect(buttons[3].fields).toEqual({ url: 'https://example.com/menu' });
    expect([...checked.buttonIds]).toEqual(['b-wa', 'b-call', 'b-map', 'b-menu', 'b-mail']);
  });

  it('keeps only the fields it knows', () => {
    const page = samplePage();
    page.extra = 'dropped';
    page.blocks[2].html = '<script>alert(1)</script>';
    page.blocks[3].items[0].href = 'javascript:alert(1)';
    const { content } = parsePageContent(page);
    expect(content).not.toHaveProperty('extra');
    expect(content.blocks[2]).toEqual({ id: 'about', type: 'text', hidden: false, text: page.blocks[2].text });
    expect(content.blocks[3].items[0]).not.toHaveProperty('href');
  });

  it('needs a theme, a brand colour as #RRGGBB, and a known font or none', () => {
    expect(parsePageContent({ ...samplePage(), theme: 'neon' })).toMatchObject({ ok: false, path: 'theme' });
    expect(parsePageContent({ ...samplePage(), brand: 'green' })).toMatchObject({ ok: false, path: 'brand' });
    expect(parsePageContent({ ...samplePage(), brand: '#fff' })).toMatchObject({ ok: false, path: 'brand' });
    expect(parsePageContent({ ...samplePage(), font: 'comic-sans' })).toMatchObject({ ok: false, path: 'font' });
    expect(parsePageContent({ ...samplePage(), font: 'fraunces' }).content.font).toBe('fraunces');
    expect(parsePageContent(null)).toMatchObject({ ok: false, path: 'content' });
  });

  it('starts every page with exactly one header', () => {
    const noHeader = samplePage();
    noHeader.blocks.shift();
    expect(parsePageContent(noHeader)).toMatchObject({ ok: false, path: 'blocks' });
    expect(parsePageContent({ ...samplePage(), blocks: [] })).toMatchObject({ ok: false, path: 'blocks' });

    const twoHeaders = samplePage();
    twoHeaders.blocks.push({ ...twoHeaders.blocks[0], id: 'header2' });
    expect(parsePageContent(twoHeaders)).toMatchObject({ ok: false, path: 'blocks.6' });
  });

  it('never hides the header, and lets other blocks be hidden', () => {
    const page = samplePage();
    page.blocks[0].hidden = true;
    page.blocks[2].hidden = true;
    const { content } = parsePageContent(page);
    expect(content.blocks[0].hidden).toBe(false);
    expect(content.blocks[2].hidden).toBe(true);
  });

  it('refuses unknown blocks, missing ids and ids used twice', () => {
    expect(parsePageContent(withBlock(2, { id: 'x', type: 'video' }))).toMatchObject({ ok: false, path: 'blocks.2.type' });
    expect(parsePageContent(withBlock(2, (b) => ({ ...b, id: '' })))).toMatchObject({ ok: false, path: 'blocks.2.id' });
    expect(parsePageContent(withBlock(2, (b) => ({ ...b, id: 'has space' })))).toMatchObject({ ok: false, path: 'blocks.2.id' });
    expect(parsePageContent(withBlock(2, (b) => ({ ...b, id: 'offer' })))).toMatchObject({ ok: false, path: 'blocks.2.id' });
    // Buttons share the same ids as blocks.
    expect(
      parsePageContent(withBlock(3, (b) => ({ ...b, items: [{ ...b.items[0], id: 'about' }] })))
    ).toMatchObject({ ok: false, path: 'blocks.3.items.0.id' });
  });

  it('limits the number of blocks', () => {
    const page = samplePage();
    while (page.blocks.length < PAGE_LIMITS.blocks) {
      page.blocks.push({ id: `t${page.blocks.length}`, type: 'text', text: 'More' });
    }
    expect(parsePageContent(page).ok).toBe(true);
    page.blocks.push({ id: 'one-too-many', type: 'text', text: 'More' });
    expect(parsePageContent(page)).toMatchObject({ ok: false, path: 'blocks' });
  });

  it('checks text fields: required ones, lengths, and characters that could disguise text', () => {
    expect(parsePageContent(withBlock(0, (b) => ({ ...b, title: '   ' })))).toMatchObject({
      ok: false,
      path: 'blocks.0.title',
      error: 'Enter a title.',
    });
    expect(parsePageContent(withBlock(2, (b) => ({ ...b, text: 'a'.repeat(PAGE_LIMITS.text + 1) })))).toMatchObject({
      ok: false,
      path: 'blocks.2.text',
    });
    // A right-to-left override could make a page show text that isn't what's stored.
    expect(parsePageContent(withBlock(0, (b) => ({ ...b, title: 'Sale ‮elas' })))).toMatchObject({
      ok: false,
      path: 'blocks.0.title',
    });
    expect(parsePageContent(withBlock(1, (b) => ({ ...b, headline: 'Line\u0000break' })))).toMatchObject({
      ok: false,
      path: 'blocks.1.headline',
    });
    expect(parsePageContent(withBlock(0, (b) => ({ ...b, title: 42 })))).toMatchObject({ ok: false, path: 'blocks.0.title' });
  });

  describe('buttons', () => {
    const withButton = (button) =>
      withBlock(3, (b) => ({ ...b, items: [{ id: 'b1', label: 'Go', ...button }] }));

    it('only allows the button kinds there are', () => {
      expect(parsePageContent(withButton({ kind: 'script', fields: {} }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.kind',
      });
    });

    it('only allows secure web links', () => {
      // Codes can point at a campaign page, but a page's buttons can't.
      for (const url of ['javascript:alert(1)', 'http://example.com', 'data:text/html,hi', 'ftp://example.com', 'qrgo-page:3']) {
        expect(parsePageContent(withButton({ kind: 'link', fields: { url } }))).toMatchObject({
          ok: false,
          path: 'blocks.3.items.0.fields.url',
        });
      }
    });

    it('checks each kind’s fields with the code type rules', () => {
      expect(parsePageContent(withButton({ kind: 'call', fields: { number: 'call me' } }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.fields.number',
      });
      expect(parsePageContent(withButton({ kind: 'whatsapp', fields: { number: '082 123 4567' } }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.fields.number',
      });
      expect(parsePageContent(withButton({ kind: 'email', fields: { to: 'not an address' } }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.fields.to',
      });
      expect(parsePageContent(withButton({ kind: 'directions', fields: {} }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.fields.query',
      });
    });

    it('needs a label, and between 1 and 6 buttons a block', () => {
      expect(parsePageContent(withButton({ kind: 'call', label: '', fields: { number: '0215550100' } }))).toMatchObject({
        ok: false,
        path: 'blocks.3.items.0.label',
      });
      expect(parsePageContent(withBlock(3, (b) => ({ ...b, items: [] })))).toMatchObject({
        ok: false,
        path: 'blocks.3.items',
      });
      const seven = Array.from({ length: 7 }, (_, i) => ({
        id: `b${i}`,
        kind: 'call',
        label: `Call ${i}`,
        fields: { number: '0215550100' },
      }));
      expect(parsePageContent(withBlock(3, (b) => ({ ...b, items: seven })))).toMatchObject({
        ok: false,
        path: 'blocks.3.items',
      });
    });
  });

  it('checks Details rows', () => {
    const withRows = (rows) => withBlock(4, (b) => ({ ...b, rows }));
    expect(parsePageContent(withRows([{ label: 'When', value: '' }]))).toMatchObject({
      ok: false,
      path: 'blocks.4.rows.0.value',
    });
    expect(parsePageContent(withRows([]))).toMatchObject({ ok: false, path: 'blocks.4.rows' });
    const tooMany = Array.from({ length: PAGE_LIMITS.detailRows + 1 }, () => ({ value: 'x' }));
    expect(parsePageContent(withRows(tooMany))).toMatchObject({ ok: false, path: 'blocks.4.rows' });
    // An unknown icon is dropped rather than refused.
    const { content } = parsePageContent(withRows([{ icon: 'rocket', value: 'Soon' }]));
    expect(content.blocks[4].rows).toEqual([{ icon: null, label: '', value: 'Soon' }]);
  });

  it('checks Offer blocks, and only shows a Copy button next to a code', () => {
    expect(parsePageContent(withBlock(1, (b) => ({ ...b, headline: '' })))).toMatchObject({
      ok: false,
      path: 'blocks.1.headline',
    });
    const { content } = parsePageContent(withBlock(1, (b) => ({ ...b, code: '', copyButton: true })));
    expect(content.blocks[1].copyButton).toBe(false);
  });

  it('checks an Image block’s optional link', () => {
    expect(parsePageContent(withBlock(5, (b) => ({ ...b, link: 'javascript:alert(1)' })))).toMatchObject({
      ok: false,
      path: 'blocks.5.link',
    });
    expect(parsePageContent(withBlock(5, (b) => ({ ...b, link: 'qrgo-page:3' })))).toMatchObject({
      ok: false,
      path: 'blocks.5.link',
    });
    const { content } = parsePageContent(withBlock(5, (b) => ({ ...b, link: 'example.com/cakes' })));
    expect(content.blocks[5].link).toBe('https://example.com/cakes');
  });

  describe('images', () => {
    it('only shows images that belong to the page', () => {
      const page = withBlock(5, (b) => ({ ...b, image: 7 }));
      expect(parsePageContent(page)).toMatchObject({ ok: false, path: 'blocks.5.image' });
      expect(parsePageContent(page, { imageIds: new Set([8]) })).toMatchObject({ ok: false, path: 'blocks.5.image' });
      expect(parsePageContent(page, { imageIds: new Set([7]) }).content.blocks[5].image).toBe(7);
      // Only whole numbers, not strings that look like them.
      expect(parsePageContent(withBlock(5, (b) => ({ ...b, image: '7' })), { imageIds: new Set([7]) })).toMatchObject({
        ok: false,
      });
    });

    it('shows at most 16 different images, counting galleries', () => {
      const ids = new Set(Array.from({ length: 17 }, (_, i) => i + 1));
      const page = samplePage();
      page.blocks[0].cover = 1;
      page.blocks[0].logo = 2;
      page.blocks[5].image = 3;
      for (const id of [4, 5, 6, 7, 8]) page.blocks.push({ id: `img${id}`, type: 'image', image: id });
      page.blocks.push({ id: 'gallery', type: 'gallery', items: [9, 10, 11, 12, 13, 14, 15, 16].map((image) => ({ image, alt: '' })) });
      expect(parsePageContent(page, { imageIds: ids }).ok).toBe(true);
      // The same image twice counts once.
      page.blocks.push({ id: 'again', type: 'image', image: 6 });
      expect(parsePageContent(page, { imageIds: ids }).ok).toBe(true);
      page.blocks.push({ id: 'img17', type: 'image', image: 17 });
      expect(parsePageContent(page, { imageIds: ids })).toMatchObject({ ok: false, path: 'blocks' });
    });
  });
});

describe('parsePageInput', () => {
  const input = (extra = {}) => ({ name: 'Black Friday 2026', content: samplePage(), ...extra });

  it('accepts a page with no end', () => {
    const checked = parsePageInput(input(), { nowMs: NOW });
    expect(checked.ok).toBe(true);
    expect(checked.page).toMatchObject({ name: 'Black Friday 2026', endsAt: null, afterEnd: 'ended', keptButton: null });
  });

  it('needs a name', () => {
    expect(parsePageInput(input({ name: ' ' }), { nowMs: NOW })).toMatchObject({ ok: false, path: 'name' });
    expect(checkPageName('x'.repeat(PAGE_LIMITS.name + 1)).error).toBeTruthy();
    expect(parsePageInput('nonsense')).toMatchObject({ ok: false });
  });

  it('stores the end as UTC, and refuses times without an offset or too far ahead', () => {
    const checked = parsePageInput(input({ endsAt: '2026-11-30T16:00:00+02:00' }), { nowMs: NOW });
    expect(checked.page.endsAt).toBe('2026-11-30 14:00:00');
    expect(parsePageInput(input({ endsAt: '2026-11-30T16:00' }), { nowMs: NOW })).toMatchObject({
      ok: false,
      path: 'endsAt',
    });
    expect(parsePageInput(input({ endsAt: '2040-01-01T00:00:00Z' }), { nowMs: NOW })).toMatchObject({
      ok: false,
      path: 'endsAt',
    });
    expect(parsePageInput(input({ endsAt: '' }), { nowMs: NOW }).page.endsAt).toBeNull();
  });

  it('keeps one of the page’s own buttons after the end, or none', () => {
    expect(parsePageInput(input({ keptButton: 'b-menu' }), { nowMs: NOW }).page.keptButton).toBe('b-menu');
    expect(parsePageInput(input({ keptButton: 'b-gone' }), { nowMs: NOW })).toMatchObject({
      ok: false,
      path: 'keptButton',
    });
    // A page that keeps showing after its end needs no kept button.
    expect(parsePageInput(input({ afterEnd: 'keep', keptButton: 'b-menu' }), { nowMs: NOW }).page.keptButton).toBeNull();
    expect(parsePageInput(input({ afterEnd: 'vanish' }), { nowMs: NOW })).toMatchObject({ ok: false, path: 'afterEnd' });
  });

  it('passes on problems in the content with their path', () => {
    const content = withBlock(0, (b) => ({ ...b, title: '' }));
    expect(parsePageInput(input({ content }), { nowMs: NOW })).toMatchObject({ ok: false, path: 'blocks.0.title' });
  });
});

describe('newPageContent', () => {
  it('is a valid page with just a header', () => {
    const content = newPageContent('Spring menu');
    expect(parsePageContent(content)).toEqual({ ok: true, content, buttonIds: new Set() });
  });
});

describe('buttonLink', () => {
  it('rebuilds each kind of link from its checked fields', () => {
    const { content } = parsePageContent(samplePage());
    const links = content.blocks[3].items.map(buttonLink);
    expect(links).toEqual([
      'https://wa.me/27821234567?text=Hi!',
      'tel:0215550100',
      'https://www.google.com/maps/search/?api=1&query=Shop%204%2C%20The%20Old%20Mill',
      'https://example.com/menu',
      'mailto:hello@example.com?subject=Cake%20order',
    ]);
  });

  it('gives nothing for a button that wouldn’t pass the checks', () => {
    expect(buttonLink({ kind: 'link', fields: { url: 'javascript:alert(1)' } })).toBeNull();
    expect(buttonLink({ kind: 'link', fields: { url: 'qrgo-page:3' } })).toBeNull();
    expect(buttonLink({ kind: 'teleport', fields: {} })).toBeNull();
    expect(buttonLink(null)).toBeNull();
  });
});

describe('pickTextColor', () => {
  it('uses white text where it reads well, and dark text on light colours', () => {
    expect(pickTextColor('#1F6F4A')).toBe('#FFFFFF'); // dark green
    expect(pickTextColor('#8A3B1F')).toBe('#FFFFFF'); // terracotta
    expect(pickTextColor('#F4B860')).toBe('#141414'); // amber
    expect(pickTextColor('#FFFFFF')).toBe('#141414');
  });

  it('falls back to dark text for a colour it can’t read', () => {
    expect(pickTextColor('not a colour')).toBe('#141414');
  });
});

describe('page references', () => {
  it('points a destination at a page and reads it back', () => {
    expect(pageReference(12)).toBe('qrgo-page:12');
    expect(pageIdFromReference('qrgo-page:12')).toBe(12);
    expect(pagePath('abc_1', 12)).toBe('/r/abc_1/p/12');
  });

  it('reads nothing else as a page', () => {
    for (const value of ['https://example.com', 'qrgo-page:', 'qrgo-page:0', 'qrgo-page:-1', 'qrgo-page:1x', ' qrgo-page:1', 'qrgo-page:12345678901', null, 12]) {
      expect(pageIdFromReference(value)).toBeNull();
    }
  });
});

describe('pageView', () => {
  const stored = (extra = {}) => ({
    content: parsePageContent(samplePage()).content,
    endsAt: '2026-11-30 14:00:00',
    afterEnd: 'ended',
    keptButton: 'b-menu',
    ...extra,
  });
  const BEFORE = Date.parse('2026-11-30T13:59:59Z');
  const AFTER = Date.parse('2026-11-30T14:00:00Z');

  it('shows every block that isn’t hidden until the end', () => {
    const page = stored();
    page.content.blocks[2].hidden = true;
    const view = pageView(page, BEFORE);
    expect(view.ended).toBe(false);
    expect(view.header.title).toBe('Black Friday weekend');
    expect(view.blocks.map((b) => b.id)).toEqual(['offer', 'contact', 'details', 'photo']);
    expect(view.keptButton).toBeNull();
  });

  it('shows the ended view, with the kept button, from the end time on', () => {
    const view = pageView(stored(), AFTER);
    expect(view).toMatchObject({ ended: true, blocks: [] });
    expect(view.keptButton).toMatchObject({ id: 'b-menu', label: 'See our full menu' });
    expect(pageView(stored({ keptButton: null }), AFTER).keptButton).toBeNull();
    // A kept button that has since been removed is just left out.
    expect(pageView(stored({ keptButton: 'b-gone' }), AFTER).keptButton).toBeNull();
  });

  it('never ends a page set to keep showing, or one with no end', () => {
    expect(isPageEnded(stored({ afterEnd: 'keep' }), AFTER)).toBe(false);
    expect(isPageEnded(stored({ endsAt: null }), AFTER)).toBe(false);
    // The end as an ISO string (the API's shape) works the same.
    expect(isPageEnded(stored({ endsAt: '2026-11-30T14:00:00Z' }), AFTER)).toBe(true);
  });
});
