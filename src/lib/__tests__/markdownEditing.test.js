import { describe, it, expect } from 'vitest';
import {
  toggleWrap,
  toggleLinePrefix,
  normalizeLinkInput,
  insertLink,
  continueList,
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
