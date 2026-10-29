import { describe, it, expect } from 'vitest';
import {
  toggleWrap,
  toggleLinePrefix,
  normalizeLinkInput,
  insertLink,
  continueList,
  insertTable,
  continueTable,
  moveTableCell,
} from '../markdownEditing';

/** Apply a change and show the result with the selection marked by [ ]. */
function apply(value, change) {
  const next = value.slice(0, change.from) + change.insert + value.slice(change.to);
  return (
    next.slice(0, change.selectionStart) +
    '[' +
    next.slice(change.selectionStart, change.selectionEnd) +
    ']' +
    next.slice(change.selectionEnd)
  );
}

/** Run fn on text where [ ] marks the selection. */
function run(marked, fn) {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  const value = marked.replace('[', '').replace(']', '');
  const change = fn(value, start, end);
  return change ? apply(value, change) : null;
}

describe('toggleWrap', () => {
  const bold = (value, s, e) => toggleWrap(value, s, e, '**', 'bold text');
  const italic = (value, s, e) => toggleWrap(value, s, e, '*', 'italic text');

  it('wraps the selection', () => {
    expect(run('a [word] b', bold)).toBe('a **[word]** b');
    expect(run('a [word] b', italic)).toBe('a *[word]* b');
  });

  it('keeps spaces outside the markers', () => {
    expect(run('a[ word ]b', bold)).toBe('a **[word]** b');
  });

  it('inserts a placeholder when nothing is selected', () => {
    expect(run('a [] b', bold)).toBe('a **[bold text]** b');
  });

  it('removes markers around or inside the selection', () => {
    expect(run('a **[word]** b', bold)).toBe('a [word] b');
    expect(run('a [**word**] b', bold)).toBe('a [word] b');
    expect(run('a *[word]* b', italic)).toBe('a [word] b');
  });

  it("doesn't mistake bold for italic", () => {
    expect(run('a **[word]** b', italic)).toBe('a ***[word]*** b');
    expect(run('a ***[word]*** b', italic)).toBe('a **[word]** b');
  });

  it("doesn't unwrap two separate bold parts", () => {
    expect(run('[**a** and **b**]', bold)).toBe('**[**a** and **b**]**');
  });

  it('wraps each line separately, leaving list symbols outside', () => {
    expect(run('[- one\n- two]', bold)).toBe('[- **one**\n- **two**]');
  });
});

describe('toggleLinePrefix', () => {
  const heading = (v, s, e) => toggleLinePrefix(v, s, e, 'h2');
  const bullets = (v, s, e) => toggleLinePrefix(v, s, e, 'bullet');
  const numbers = (v, s, e) => toggleLinePrefix(v, s, e, 'number');

  it('turns the current line into a heading, and back', () => {
    expect(run('intro\nTi[]tle\nmore', heading)).toBe('intro\n## Title[]\nmore');
    expect(run('## Ti[]tle', heading)).toBe('Title[]');
  });

  it('swaps one kind of heading for another', () => {
    expect(run('### Ti[]tle', heading)).toBe('## Title[]');
  });

  it('adds a heading symbol on an empty line', () => {
    expect(run('a\n[]\nb', heading)).toBe('a\n## []\nb');
  });

  it('makes a list from every selected line, skipping blank lines', () => {
    expect(run('[one\n\ntwo]', bullets)).toBe('[- one\n\n- two]');
    expect(run('[one\ntwo]', numbers)).toBe('[1. one\n2. two]');
  });

  it('switches bullets to numbers and removes them again', () => {
    expect(run('[- one\n- two]', numbers)).toBe('[1. one\n2. two]');
    expect(run('[- one\n- two]', bullets)).toBe('[one\ntwo]');
  });

  it('carries on the numbering of the list above', () => {
    expect(run('1. a\n2. b\nc[]', numbers)).toBe('1. a\n2. b\n3. c[]');
  });

  it('ignores a line the selection only reaches the start of', () => {
    expect(run('[one\n]two', bullets)).toBe('[- one]\ntwo');
  });
});

describe('normalizeLinkInput', () => {
  it('accepts web addresses, emails and site pages', () => {
    expect(normalizeLinkInput(' https://a.com/x ')).toBe('https://a.com/x');
    expect(normalizeLinkInput('www.a.com')).toBe('https://www.a.com');
    expect(normalizeLinkInput('a.co.za/page')).toBe('https://a.co.za/page');
    expect(normalizeLinkInput('legal@a.com')).toBe('mailto:legal@a.com');
    expect(normalizeLinkInput('/terms')).toBe('/terms');
    expect(normalizeLinkInput('tel:+27 (21) 000-1234')).toBe('tel:+27210001234');
  });

  it('encodes characters that would end the link early', () => {
    expect(normalizeLinkInput('https://a.com/a b (1)')).toBe('https://a.com/a%20b%20%281%29');
  });

  it('rejects anything else', () => {
    expect(normalizeLinkInput('')).toBeNull();
    expect(normalizeLinkInput('not a link')).toBeNull();
    expect(normalizeLinkInput('javascript:alert(1)')).toBeNull();
  });
});

describe('insertLink', () => {
  const link = (href) => (v, s, e) => insertLink(v, s, e, href);

  it('links the selected text', () => {
    expect(run('see [our terms] here', link('/terms'))).toBe('see [our terms](/terms)[] here');
  });

  it('uses the address as the text when nothing is selected', () => {
    expect(run('email []', link('mailto:a@b.co'))).toBe('email [a@b.co](mailto:a@b.co)[]');
  });
});

describe('continueList', () => {
  it('starts the next bullet or number', () => {
    expect(run('- one[]', continueList)).toBe('- one\n- []');
    expect(run('9. one[]', continueList)).toBe('9. one\n10. []');
  });

  it('ends the list on an empty item', () => {
    expect(run('- one\n- []', continueList)).toBe('- one\n[]');
  });

  it('does nothing outside a list or with a selection', () => {
    expect(run('plain[]', continueList)).toBeNull();
    expect(run('- [one]', continueList)).toBeNull();
    expect(run('**bold**[]', continueList)).toBeNull();
  });
});

describe('insertTable', () => {
  const table = (columns, rows) => (value, s, e) => insertTable(value, s, e, columns, rows);

  it('adds a table with the first heading selected', () => {
    expect(run('[]', table(2, 3))).toBe('| [Column 1] | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |');
    expect(run('[]', table(1, 1))).toBe('| [Column 1] |\n| --- |');
  });

  it('goes after the current line, with a blank line around it', () => {
    expect(run('Intro te[]xt\nMore', table(1, 2))).toBe('Intro text\n\n| [Column 1] |\n| --- |\n|  |\n\nMore');
    expect(run('Intro[]', table(1, 1))).toBe('Intro\n\n| [Column 1] |\n| --- |');
  });

  it('fills an empty line without adding extra blank lines', () => {
    expect(run('One\n\n[]\n\nTwo', table(1, 1))).toBe('One\n\n| [Column 1] |\n| --- |\n\nTwo');
    expect(run('One\n[]\nTwo', table(1, 1))).toBe('One\n\n| [Column 1] |\n| --- |\n\nTwo');
  });

  it('goes after a table the cursor is in, instead of splitting it', () => {
    expect(run('| a |\n| --- |\n| []1 |\n| 2 |', table(1, 1))).toBe(
      '| a |\n| --- |\n| 1 |\n| 2 |\n\n| [Column 1] |\n| --- |'
    );
  });
});

describe('continueTable', () => {
  const doc = '| Name | Role |\n| --- | --- |\n| Sam | Owner |';

  it('adds an empty row under the current one', () => {
    expect(run(doc.replace('Sam', 'S[]am'), continueTable)).toBe(`${doc}\n| [] |  |`);
    expect(run('| a | b |\n| --- | --- |\n| 1 | 2 |[]\n| 3 | 4 |', continueTable)).toBe(
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n| [] |  |\n| 3 | 4 |'
    );
  });

  it('adds the row under the header when on the header or the dashes', () => {
    const expected = '| Name | Role |\n| --- | --- |\n| [] |  |\n| Sam | Owner |';
    expect(run(doc.replace('Role', 'Role[]'), continueTable)).toBe(expected);
    expect(run(doc.replace('| --- | --- |', '| --- | ---[] |'), continueTable)).toBe(expected);
  });

  it('ends the table on an empty last row', () => {
    expect(run(`${doc}\n| [] |  |`, continueTable)).toBe(`${doc}\n[]`);
  });

  it('keeps an empty row in the middle and adds another', () => {
    expect(run('| a |\n| --- |\n|  []|\n| 1 |', continueTable)).toBe('| a |\n| --- |\n|  |\n| [] |\n| 1 |');
  });

  it('leaves Enter alone outside a table and at the very start of one', () => {
    expect(run('plain | text[]', continueTable)).toBeNull();
    expect(run('[]| a |\n| --- |', continueTable)).toBeNull();
    expect(run(`${doc}\n\nafter[]`, continueTable)).toBeNull();
    expect(run(doc.replace('Sam', '[Sam]'), continueTable)).toBeNull();
  });
});

describe('moveTableCell', () => {
  const doc = '| Name | Role |\n| --- | --- |\n| Sam |  |';
  const next = (value, s, e) => moveTableCell(value, s, e, false);
  const back = (value, s, e) => moveTableCell(value, s, e, true);

  it('selects the next cell, skipping the dashes', () => {
    expect(run(doc.replace('Name', 'Na[]me'), next)).toBe(doc.replace('Role', '[Role]'));
    expect(run(doc.replace('Role', '[Role]'), next)).toBe(doc.replace('Sam', '[Sam]'));
  });

  it('puts the cursor inside an empty cell', () => {
    expect(run(doc.replace('Sam', 'Sam[]'), next)).toBe('| Name | Role |\n| --- | --- |\n| Sam | [] |');
  });

  it('adds a row after the last cell', () => {
    expect(run('| Name | Role |\n| --- | --- |\n| Sam |  []|', next)).toBe(`${doc}\n| [] |  |`);
  });

  it('goes back with Shift + Tab, and leaves it alone in the first cell', () => {
    expect(run(doc.replace('Sam', 'S[]am'), back)).toBe(doc.replace('Role', '[Role]'));
    expect(run(doc.replace('Name', 'Na[]me'), back)).toBeNull();
  });

  it('moves from outside the pipes at either end of a row', () => {
    expect(run('| a | b |[]\n| --- | --- |\n| 1 | 2 |', next)).toBe('| a | b |\n| --- | --- |\n| [1] | 2 |');
    expect(run('| a | b |\n| --- | --- |\n[]| 1 | 2 |', next)).toBe('| a | b |\n| --- | --- |\n| [1] | 2 |');
    expect(run('| a | b |\n| --- | --- |\n[]| 1 | 2 |', back)).toBe('| a | [b] |\n| --- | --- |\n| 1 | 2 |');
  });

  it('leaves Tab alone outside a table or across lines', () => {
    expect(run('plain[]', next)).toBeNull();
    expect(run('| a | b |\n| 1 | 2 |[]', next)).toBeNull();
    expect(run('| [a |\n| --- |\n| 1] |', next)).toBeNull();
  });
});
