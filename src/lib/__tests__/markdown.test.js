import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  parseInline,
  isSafeHref,
  plainText,
  splitTableRow,
  readTableDivider,
} from '../markdown';

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
      { type: 'paragraph', line: 0, lines: [[text('one')], [text('two')]] },
      { type: 'paragraph', line: 3, lines: [[text('three')]] },
    ]);
  });

  it('records the line each block starts on', () => {
    const text = 'Intro\n\n## Heading\n- a\n- b\n\n\nEnd';
    expect(parseMarkdown(text).map((b) => [b.type, b.line])).toEqual([
      ['paragraph', 0],
      ['heading', 2],
      ['list', 3],
      ['paragraph', 7],
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

describe('tables', () => {
  const cells = (...values) => values.map((value) => (value ? [text(value)] : []));

  it('reads a header, the line of dashes and rows', () => {
    expect(parseMarkdown('| Name | Role |\n| --- | --- |\n| Sam | Owner |\n| Lee | Admin |')).toEqual([
      {
        type: 'table',
        line: 0,
        align: [null, null],
        header: cells('Name', 'Role'),
        rows: [cells('Sam', 'Owner'), cells('Lee', 'Admin')],
      },
    ]);
  });

  it('reads column alignment from the colons', () => {
    const [table] = parseMarkdown('| a | b | c | d |\n| :-- | :-: | --: | - |');
    expect(table.align).toEqual(['left', 'center', 'right', null]);
    expect(table.rows).toEqual([]);
  });

  it('does not need the outer pipes or lined-up columns', () => {
    const [table] = parseMarkdown('Name|Role\n---|---\nSam   |    Owner');
    expect(table.header).toEqual(cells('Name', 'Role'));
    expect(table.rows).toEqual([cells('Sam', 'Owner')]);
  });

  it('formats text in cells and keeps escaped pipes', () => {
    const [table] = parseMarkdown('| a | b |\n|---|---|\n| **bold** [Terms](/terms) | x \\| y |');
    expect(table.rows[0]).toEqual([
      [{ type: 'strong', children: [text('bold')] }, text(' '), { type: 'link', href: '/terms', children: [text('Terms')] }],
      [text('x | y')],
    ]);
  });

  it('gives every row the same number of cells, so nothing typed is lost', () => {
    const [table] = parseMarkdown('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |');
    expect(table.header).toEqual(cells('a', 'b', ''));
    expect(table.align).toEqual([null, null, null]);
    expect(table.rows).toEqual([cells('1', '', ''), cells('1', '2', '3')]);
  });

  it('ends at a blank line, a line without a pipe, or a heading', () => {
    const blocks = parseMarkdown('| a |\n|---|\n| 1 |\n\nafter');
    expect(blocks.map((block) => block.type)).toEqual(['table', 'paragraph']);
    expect(blocks[1].line).toBe(4);

    expect(parseMarkdown('| a |\n|---|\n| 1 |\nafter').map((block) => block.type)).toEqual(['table', 'paragraph']);
    expect(parseMarkdown('| a |\n|---|\n## Next | part').map((block) => block.type)).toEqual(['table', 'heading']);
  });

  it('can follow a paragraph line straight away', () => {
    const blocks = parseMarkdown('Our cookies:\n| Name | Use |\n|---|---|\n| sid | login |');
    expect(blocks.map((block) => [block.type, block.line])).toEqual([
      ['paragraph', 0],
      ['table', 1],
    ]);
  });

  it('needs the line of dashes', () => {
    expect(parseMarkdown('| a | b |\n| 1 | 2 |').map((block) => block.type)).toEqual(['paragraph']);
    expect(parseMarkdown('a | b\n---').map((block) => block.type)).toEqual(['paragraph']);
    expect(parseMarkdown('| --- |')[0].type).toBe('paragraph');
  });

  it('splits rows into cells with their positions', () => {
    expect(splitTableRow('| ab |  | c\\|d |')).toEqual([
      { text: 'ab', start: 2, end: 4, segmentStart: 1, segmentEnd: 5 },
      { text: '', start: 6, end: 6, segmentStart: 6, segmentEnd: 8 },
      { text: 'c\\|d', start: 10, end: 14, segmentStart: 9, segmentEnd: 15 },
    ]);
    expect(splitTableRow('no pipes')).toBeNull();
    expect(readTableDivider('| --- | x |')).toBeNull();
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
