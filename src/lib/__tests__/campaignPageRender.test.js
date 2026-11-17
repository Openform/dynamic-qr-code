/**
 * The campaign page component (src/app/components/campaign/CampaignPage.js),
 * rendered to HTML as the server sends it: what visitors see while a page is
 * live and after it ends, and that nothing a customer types can become HTML
 * or a link of another kind.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CampaignPage from '../../app/components/campaign/CampaignPage';
import { parsePageContent, pageView } from '../campaignPages';

function content(change = (page) => page) {
  const page = {
    theme: 'fresh',
    brand: '#1F6F4A',
    font: null,
    blocks: [
      { id: 'header', type: 'header', cover: null, logo: null, title: 'Black Friday weekend', tagline: '20% off every whole cake' },
      { id: 'offer', type: 'offer', label: 'This weekend only', headline: '20% off all whole cakes', text: 'Show this code\nat the counter.', code: 'FRIDAY20', copyButton: true },
      { id: 'about', type: 'text', text: 'Order **ahead**.\n\n- Chocolate\n- Carrot\n\n[Our site](https://example.com) and [bad](javascript:alert(1))' },
      {
        id: 'contact',
        type: 'buttons',
        items: [
          { id: 'b-wa', kind: 'whatsapp', label: 'Order on WhatsApp', fields: { number: '+27 82 123 4567' } },
          { id: 'b-call', kind: 'call', label: 'Call the shop', fields: { number: '021 555 0100' } },
          { id: 'b-menu', kind: 'link', label: 'See our full menu', fields: { url: 'https://example.com/menu' } },
        ],
      },
      { id: 'details', type: 'details', rows: [{ icon: 'calendar', label: 'When', value: 'Fri 27 – Mon 30 November' }, { value: 'No label here' }] },
      { id: 'photo', type: 'image', image: null, alt: 'The cake counter', caption: 'Every cake is 20% off.' },
    ],
  };
  const checked = parsePageContent(change(page), { imageIds: new Set([31, 32, 33]) });
  if (!checked.ok) throw new Error(`${checked.path}: ${checked.error}`);
  return checked.content;
}

function render(pageContent, { ended = false, keptButton = null, images, reportHref, fileHref, nowMs, editing } = {}) {
  const page = { content: pageContent, endsAt: ended ? '2000-01-01 00:00:00' : null, afterEnd: 'ended', keptButton };
  return renderToStaticMarkup(createElement(CampaignPage, { content: pageContent, view: pageView(page, nowMs), images, reportHref, fileHref, editing }));
}

/** Every href in the HTML. */
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('CampaignPage', () => {
  it('draws every block of a live page', () => {
    const html = render(content());
    expect(html).toContain('<h1');
    expect(html).toContain('Black Friday weekend');
    expect(html).toContain('20% off every whole cake');
    expect(html).toContain('This weekend only');
    expect(html).toContain('FRIDAY20');
    expect(html).toContain('>Copy<');
    expect(html).toContain('<strong>ahead</strong>');
    expect(html).toContain('<li>Chocolate</li>');
    expect(html).toContain('<dt');
    expect(html).toContain('Fri 27 – Mon 30 November');
    expect(html).toContain('No label here');
    expect(html).toContain('Made with QR Go');
  });

  it('only links to what the checked fields build', () => {
    const links = hrefs(render(content()));
    expect(links).toEqual(
      expect.arrayContaining(['https://wa.me/27821234567', 'tel:0215550100', 'https://example.com/menu', 'https://example.com'])
    );
    expect(links.some((href) => /^javascript:/i.test(href))).toBe(false);
    // The unsafe Markdown link stays as its text.
    expect(render(content())).toContain('bad');
  });

  it('never turns what a customer typed into HTML', () => {
    const html = render(
      content((page) => {
        page.blocks[0].title = '<script>alert("title")</script>';
        page.blocks[1].headline = '<img src=x onerror=alert(1)>';
        page.blocks[2].text = '<b>bold?</b> <iframe src="https://evil.example"></iframe>';
        return page;
      })
    );
    // No real tags or attributes: the words are shown as typed.
    expect(html).not.toMatch(/<script|<iframe|<img src=x|<b>/i);
    expect(html).not.toMatch(/<[^>]+\sonerror=/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;iframe');
  });

  it('leaves out a stored button that wouldn’t pass the checks', () => {
    const pageContent = content();
    // As if the database held a link that was never checked.
    pageContent.blocks[3].items[2].fields.url = 'javascript:alert(1)';
    const html = render(pageContent);
    expect(html).not.toContain('See our full menu');
    expect(html).toContain('Call the shop');
  });

  it('makes the first button in a block the main one', () => {
    const html = render(content());
    const wa = html.indexOf('Order on WhatsApp');
    const call = html.indexOf('Call the shop');
    expect(wa).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(wa);
  });

  it('leaves out hidden blocks', () => {
    const html = render(
      content((page) => {
        page.blocks[1].hidden = true;
        return page;
      })
    );
    expect(html).not.toContain('This weekend only');
    expect(html).toContain('Order on WhatsApp');
  });

  it('draws images it’s given, and leaves out ones it isn’t', () => {
    const withImages = content((page) => {
      page.blocks[0].cover = 31;
      page.blocks[5].image = 33;
      return page;
    });
    expect(render(withImages)).not.toContain('<img');
    const html = render(withImages, {
      images: { 31: { src: '/r/abc/p/1/i/31-aa', width: 1600, height: 900 }, 33: { src: '/r/abc/p/1/i/33-bb', width: 800, height: 600 } },
    });
    expect(html).toContain('src="/r/abc/p/1/i/31-aa"');
    expect(html).toContain('alt="The cake counter"');
    expect(html).toContain('Every cake is 20% off.');
  });

  it('shows the ended message, without the blocks or tagline, after the end', () => {
    const html = render(content(), { ended: true, keptButton: 'b-menu' });
    expect(html).toContain('This campaign has ended');
    expect(html).toContain('Black Friday weekend');
    expect(html).not.toContain('20% off every whole cake');
    expect(html).not.toContain('FRIDAY20');
    expect(html).not.toContain('Order on WhatsApp');
    expect(html).toContain('See our full menu');
    expect(render(content(), { ended: true })).not.toContain('See our full menu');
  });

  it('sets the theme as CSS custom properties', () => {
    const html = render(content((page) => ({ ...page, theme: 'bold', brand: '#8A3B1F' })));
    expect(html).toContain('--cp-bg:#8A3B1F');
    expect(html).toContain('--cp-head-font:var(--font-fraunces)');
    expect(html).toContain('--cp-text-scale:1');
  });

  it('only shows “Report this page” when there’s somewhere to report to', () => {
    expect(render(content())).not.toContain('Report this page');
    expect(render(content(), { reportHref: '/r/abc/p/1/report' })).toContain('Report this page');
  });

  it('marks each block for the editor’s preview, and only there', () => {
    expect(render(content())).not.toContain('data-block-id');
    const html = render(content(), { editing: { openId: 'offer', onPick: () => {} } });
    const ids = [...html.matchAll(/data-block-id="([^"]*)"/g)].map((m) => m[1]);
    // The image block has no photo, so it draws nothing, but keeps its place.
    expect(ids).toEqual(['header', 'offer', 'about', 'contact', 'details', 'photo']);
    expect(html.match(/class="[^"]*editableOn[^"]*" data-block-id="([^"]*)"/)[1]).toBe('offer');
  });
});

describe('CampaignPage, newer blocks', () => {
  // Monday 16 November 2026, 12:00 in Johannesburg.
  const MONDAY_NOON = Date.parse('2026-11-16T10:00:00Z');
  const week = (periods) => Array.from({ length: 7 }, () => ({ periods }));

  const more = (blocks) =>
    content((page) => ({
      ...page,
      blocks: [page.blocks[0], ...blocks],
    }));

  it('draws questions that open with the browser’s own <details>, one at a time in each block', () => {
    const html = render(
      more([
        { id: 'faq', type: 'faq', title: 'Questions', items: [{ question: 'Do you deliver?', answer: 'Yes, within **10 km**.' }, { question: 'Open Sundays?', answer: 'No.' }] },
        { id: 'faq-2', type: 'faq', title: 'Booking', items: [{ question: 'Can I book?', answer: 'Yes.' }] },
      ])
    );
    expect(html).toContain('Questions');
    expect(html).toMatch(/<details[^>]*><summary[^>]*><span>Do you deliver\?<\/span>/);
    expect(html).toContain('<strong>10 km</strong>');
    // A shared name per block makes the browser close the others when one opens.
    expect([...html.matchAll(/<details[^>]* name="([^"]*)"/g)].map((m) => m[1])).toEqual(['faq-faq', 'faq-faq', 'faq-faq-2']);
  });

  it('draws opening hours with whether it’s open when the page is opened', () => {
    const hours = { id: 'hours', type: 'hours', title: '', timeZone: 'Africa/Johannesburg', days: week([{ open: '08:00', close: '17:00' }]), note: 'Closed on public holidays' };
    const html = render(more([hours]), { nowMs: MONDAY_NOON });
    expect(html).toContain('Opening hours');
    expect(html).toContain('Open now · closes 17:00');
    expect(html).toContain('Every day');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('Closed on public holidays');
    expect(render(more([{ ...hours, showStatus: false }]), { nowMs: MONDAY_NOON })).not.toContain('Open now');
  });

  it('draws a price list', () => {
    const html = render(more([{ id: 'coffee', type: 'prices', title: 'Coffee', items: [{ name: 'Flat white', price: 'R38', description: 'Double shot', tag: 'New' }] }]));
    for (const text of ['Coffee', 'Flat white', 'R38', 'Double shot', 'New']) expect(html).toContain(text);
  });

  it('draws a gallery of the photos it’s given, scrolling sideways', () => {
    const gallery = { id: 'gallery', type: 'gallery', items: [{ image: 31, alt: 'The counter' }, { image: 32, alt: 'Fresh bread' }] };
    const images = { 31: { src: '/i/31-aa', width: 1600, height: 1200 }, 32: { src: '/i/32-bb', width: 1600, height: 1200 } };
    const html = render(more([gallery]), { images });
    expect(html).toContain('aria-label="2 photos. Scroll sideways to see them all."');
    expect(html).toContain('alt="The counter"');
    expect(html).toContain('alt="Fresh bread"');
    // One photo is just a photo; none is nothing.
    expect(render(more([gallery]), { images: { 31: images[31] } })).not.toContain('Scroll sideways');
    expect(render(more([gallery]))).not.toContain('<img');
  });

  it('links calendar and contact buttons to their files, and leaves them out with nowhere to download from', () => {
    const blocks = [
      {
        id: 'b',
        type: 'buttons',
        items: [
          { id: 'b-cal', kind: 'calendar', label: 'Add to calendar', fields: { title: 'Market', startsAt: '2026-12-06T08:00:00Z' } },
          { id: 'b-card', kind: 'contact', label: 'Save our contact', fields: { name: 'Bean There', phone: '021 555 0100' } },
          { id: 'b-call', kind: 'call', label: 'Call us', fields: { number: '021 555 0100' } },
        ],
      },
    ];
    const fileHref = (buttonId, type) => `/r/abc/p/4/f/${buttonId}.${type}`;
    const links = hrefs(render(more(blocks), { fileHref }));
    expect(links).toEqual(expect.arrayContaining(['/r/abc/p/4/f/b-cal.ics', '/r/abc/p/4/f/b-card.vcf', 'tel:0215550100']));
    const html = render(more(blocks));
    expect(html).not.toContain('Add to calendar');
    expect(html).toContain('Call us');
  });

  it('never turns what a customer typed into HTML', () => {
    const attack = '<img src=x onerror=alert(1)>';
    const html = render(
      more([
        { id: 'faq', type: 'faq', title: attack, items: [{ question: attack, answer: attack }] },
        { id: 'p', type: 'prices', title: attack, items: [{ name: attack, price: '<b>R5</b>', description: attack, tag: '<i>x</i>' }] },
        { id: 'h', type: 'hours', title: attack, timeZone: 'Africa/Johannesburg', days: week([]), note: attack },
      ]),
      { nowMs: MONDAY_NOON }
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
