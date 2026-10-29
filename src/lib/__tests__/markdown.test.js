import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline, isSafeHref, plainText } from '../markdown';

const text = (value) => ({ type: 'text', text: value });

describe('parseInline', () => {
  it('reads bold, italic and links', () => {
    expect(parseInline('a **b** *c* [d](https://x.com)')).toEqual([
      text('a '),
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('c')] },
      text(' '),
      { type: 'link', href: 'https://x.com', children: [text('d')] },
    ]);
  });

  it('reads bold and italic together', () => {
    expect(parseInline('***both***')).toEqual([
      { type: 'strong', children: [{ type: 'em', children: [text('both')] }] },
    ]);
  });

  it('allows formatting inside link text', () => {
    expect(parseInline('[**Terms**](/terms)')).toEqual([
      { type: 'link', href: '/terms', children: [{ type: 'strong', children: [text('Terms')] }] },
    ]);
  });

  it('leaves unmatched symbols as they are', () => {
    expect(parseInline('5 * 3 and **open')).toEqual([text('5 * 3 and **open')]);
    expect(parseInline('the laws of [Jurisdiction], and')).toEqual([
      text('the laws of [Jurisdiction], and'),
    ]);
  });

  it('shows escaped symbols as-is', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([text('*not italic*')]);
  });

  it('keeps the text of unsafe links but drops the link', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([text('click)')]);
    expect(parseInline('[x](//evil.example)')).toEqual([text('x')]);
  });

  it('treats HTML as plain text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      text('<script>alert(1)</script>'),
    ]);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and keeps line breaks within them', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', lines: [[text('one')], [text('two')]] },
      { type: 'paragraph', lines: [[text('three')]] },
    ]);
  });

  it('reads headings with ids for linking', () => {
    const blocks = parseMarkdown('## 1. Who we are\n### Details\n## 1. Who we are');
    expect(blocks.map((b) => [b.type, b.level, b.id])).toEqual([
      ['heading', 2, '1-who-we-are'],
      ['heading', 3, 'details'],
      ['heading', 2, '1-who-we-are-2'],
    ]);
  });

  it('keeps a "#" that is part of the heading text', () => {
    expect(plainText(parseMarkdown('## Using C#')[0].children)).toBe('Using C#');
    expect(plainText(parseMarkdown('## Title ##')[0].children)).toBe('Title');
  });

  it('reads bullet and numbered lists, without needing a blank line first', () => {
    const blocks = parseMarkdown('Intro:\n- a\n- b\n\n3. c\n4. d');
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false, start: 1 });
    expect(blocks[1].items).toEqual([[[text('a')]], [[text('b')]]]);
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(blocks[2].items).toHaveLength(2);
  });

  it('continues a list item on an indented line', () => {
    const [list] = parseMarkdown('- first\n  more\n- second');
    expect(list.items).toEqual([[[text('first')], [text('more')]], [[text('second')]]]);
  });

  it('does not treat bold at the start of a line as a bullet', () => {
    expect(parseMarkdown('**Bold** start')[0].type).toBe('paragraph');
  });

  it('handles empty and Windows-style text', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
    expect(parseMarkdown('a\r\n\r\nb')).toHaveLength(2);
  });
});

describe('isSafeHref', () => {
  it('allows web, email, phone and site links', () => {
    for (const href of ['https://a.com/x?y=1', 'http://a.com', 'mailto:a@b.co', 'tel:+27 21 000', '/terms', '#contact']) {
      expect(isSafeHref(href)).toBe(true);
    }
  });

  it('blocks anything else', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'vbscript:x', '', 'example.com']) {
      expect(isSafeHref(href)).toBe(false);
    }
  });
});
