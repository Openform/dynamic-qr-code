/**
 * A small Markdown subset for the legal pages, edited from /admin/legal.
 *
 *   ## Heading           ### Subheading
 *   **bold**             *italic*
 *   - bullet item        1. numbered item
 *   [link text](https://example.com)   (also mailto:, tel:, /path and #anchor)
 *   \*                   a backslash shows the next symbol as-is
 *
 * Lines next to each other form one paragraph, with a line break between
 * them; a blank line starts a new paragraph.
 *
 * parseMarkdown() returns plain data (blocks and inline nodes) that
 * FormattedText renders as React elements. Nothing is ever treated as HTML,
 * so saved text can't inject markup or scripts, and links with any other
 * scheme (e.g. javascript:) are shown as plain text.
 *
 * Shared by the server (public pages) and the browser (admin preview), so
 * this file must stay free of server-only imports.
 */

const HEADING_RE = /^(#{1,3})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const INDENTED_RE = /^\s{2,}\S/;
const ESCAPABLE = '\\`*_{}[]()#+-.!>~|';

/** True for link targets we're happy to render. */
export function isSafeHref(href) {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (!value) return false;
  // Internal paths and same-page anchors (but not protocol-relative "//host").
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('#')) {
    return true;
  }
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d][\d\s()-]*)$/i.test(value);
}

/**
 * Parse text into blocks:
 *   { type: 'heading', line, level: 2 | 3, id, children: Inline[] }
 *   { type: 'paragraph', line, lines: Inline[][] }
 *   { type: 'list', line, ordered, start, items: Inline[][][] }   (each item is lines)
 *
 * `line` is the 0-based line of the text the block starts on, which the admin
 * editor uses to keep its preview scrolled to the same place.
 */
export function parseMarkdown(text) {
  const source = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  const blocks = [];
  const usedIds = new Map();
  let current = null; // the paragraph or list still being added to

  const sourceLines = source.split('\n');
  for (let lineNumber = 0; lineNumber < sourceLines.length; lineNumber += 1) {
    const line = sourceLines[lineNumber];
    if (!line.trim()) {
      current = null;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading && heading[2]) {
      const children = parseInline(heading[2]);
      blocks.push({
        type: 'heading',
        line: lineNumber,
        // "#" and "##" are both section headings: the page title is the only h1.
        level: heading[1].length === 3 ? 3 : 2,
        id: uniqueId(slugify(plainText(children)), usedIds),
        children,
      });
      current = null;
      continue;
    }

    const bullet = line.match(BULLET_RE);
    const numbered = bullet ? null : line.match(NUMBERED_RE);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const itemText = bullet ? bullet[1] : numbered[2];
      if (current?.type !== 'list' || current.ordered !== ordered) {
        current = {
          type: 'list',
          line: lineNumber,
          ordered,
          start: ordered ? Number(numbered[1]) : 1,
          items: [],
        };
        blocks.push(current);
      }
      current.items.push([parseInline(itemText)]);
      continue;
    }

    // An indented line straight after a list item continues that item.
    if (current?.type === 'list' && INDENTED_RE.test(line)) {
      current.items[current.items.length - 1].push(parseInline(line.trim()));
      continue;
    }

    if (current?.type !== 'paragraph') {
      current = { type: 'paragraph', line: lineNumber, lines: [] };
      blocks.push(current);
    }
    current.lines.push(parseInline(line.trim()));
  }

  return blocks;
}

/**
 * Parse one line into inline nodes:
 *   { type: 'text', text } | { type: 'strong' | 'em', children }
 *   | { type: 'link', href, children }
 */
export function parseInline(text) {
  const nodes = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (text.startsWith('**', i)) {
      let close = findMarker(text, '**', i + 2);
      // "***both***": close on the last two stars so the inner "*…*" is italic.
      while (close !== -1 && text[close + 2] === '*') close += 1;
      if (close > i + 2) {
        flush();
        nodes.push({ type: 'strong', children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    } else if (char === '*' && text[i + 1] && !/\s/.test(text[i + 1])) {
      const close = findMarker(text, '*', i + 1);
      if (close > i + 1) {
        flush();
        nodes.push({ type: 'em', children: parseInline(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }

    if (char === '[') {
      const link = matchLink(text, i);
      if (link) {
        flush();
        const children = parseInline(link.label);
        // An unsafe target keeps its text but loses the link.
        if (isSafeHref(link.href)) {
          nodes.push({ type: 'link', href: link.href.trim(), children });
        } else {
          nodes.push(...children);
        }
        i = link.end;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return mergeText(nodes);
}

/** Index of the next unescaped `marker` at or after `from`, or -1. */
function findMarker(text, marker, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (marker === '*') {
      // A single "*" closes italic; skip over "**" pairs (bold inside italic).
      if (text[i] === '*') {
        if (text[i + 1] === '*') {
          i += 1;
          continue;
        }
        // "*a * b*": a star after a space doesn't close, keep looking.
        if (!/\s/.test(text[i - 1])) return i;
      }
    } else if (text.startsWith(marker, i)) {
      return i;
    }
  }
  return -1;
}

/** Match "[label](href)" starting at `start`, or null. */
function matchLink(text, start) {
  let depth = 0;
  let labelEnd = -1;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
    } else if (text[i] === '[') {
      depth += 1;
    } else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        labelEnd = i;
        break;
      }
    }
  }
  if (labelEnd <= start + 1 || text[labelEnd + 1] !== '(') return null;

  const hrefEnd = text.indexOf(')', labelEnd + 2);
  if (hrefEnd === -1) return null;
  const href = text.slice(labelEnd + 2, hrefEnd);
  if (!href.trim()) return null;

  return { label: text.slice(start + 1, labelEnd), href, end: hrefEnd + 1 };
}

/** Join neighbouring text nodes (left over from unsafe links). */
function mergeText(nodes) {
  const merged = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === 'text' && last?.type === 'text') {
      last.text += node.text;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

/** The visible text of some inline nodes. */
export function plainText(nodes) {
  return nodes
    .map((node) => (node.type === 'text' ? node.text : plainText(node.children)))
    .join('');
}

/** "1. Information we collect" → "1-information-we-collect". */
function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base, usedIds) {
  const id = base || 'section';
  const count = usedIds.get(id) ?? 0;
  usedIds.set(id, count + 1);
  return count === 0 ? id : `${id}-${count + 1}`;
}
