/**
 * Text changes behind the formatting toolbar in the legal page editor
 * (/admin/legal). Each function takes the text and the selection and returns
 * a change to apply:
 *
 *   { from, to, insert, selectionStart, selectionEnd }
 *
 * meaning "replace value[from..to] with `insert`, then select
 * selectionStart..selectionEnd" (positions in the new text). Returns null when
 * there's nothing to do. See markdown.js for the formatting itself.
 */

import { isSafeHref } from './markdown';

const BLOCK_PREFIX_RE = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d{1,9}[.)]\s+)?/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const EMAIL_RE = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i;

/** Number of `*` characters in a row ending just before `index`. */
function starsBefore(value, index) {
  let count = 0;
  while (index - count - 1 >= 0 && value[index - count - 1] === '*') count += 1;
  return count;
}

/** Number of `*` characters in a row starting at `index`. */
function starsAfter(value, index) {
  let count = 0;
  while (value[index + count] === '*') count += 1;
  return count;
}

/** Whether star runs of these lengths make up the given marker. */
function runsMatch(marker, before, after) {
  if (marker === '**') return before >= 2 && after >= 2;
  // Italic: exactly "*x*", or "***x***" (bold and italic together).
  return (before === 1 && after === 1) || (before >= 3 && after >= 3);
}

/**
 * Bold ("**") or italic ("*"). Wraps the selection, or removes the markers
 * if it's already wrapped. With nothing selected, inserts `placeholder`
 * wrapped and selected, ready to type over.
 */
export function toggleWrap(value, start, end, marker, placeholder) {
  const size = marker.length;

  if (start === end) {
    return {
      from: start,
      to: end,
      insert: marker + placeholder + marker,
      selectionStart: start + size,
      selectionEnd: start + size + placeholder.length,
    };
  }

  const selected = value.slice(start, end);
  if (selected.includes('\n')) return wrapLines(value, start, end, marker);

  // Markers just outside the selection: remove them.
  if (runsMatch(marker, starsBefore(value, start), starsAfter(value, end))) {
    return {
      from: start - size,
      to: end + size,
      insert: selected,
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }

  // Markers included in the selection: remove them.
  const inner = selected.slice(size, selected.length - size);
  const leading = starsAfter(selected, 0);
  const trailing = starsBefore(selected, selected.length);
  const innerHasMarker =
    marker === '**' ? inner.includes('**') : inner.replace(/\*\*/g, '').includes('*');
  if (selected.length > size * 2 && runsMatch(marker, leading, trailing) && !innerHasMarker) {
    return {
      from: start,
      to: end,
      insert: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  // Keep spaces at the edges outside the markers ("**word** ", not "**word **").
  const lead = selected.length - selected.trimStart().length;
  const core = selected.trim();
  if (!core) return toggleWrap(value, start, start, marker, placeholder);
  const trail = selected.slice(lead + core.length);
  return {
    from: start,
    to: end,
    insert: selected.slice(0, lead) + marker + core + marker + trail,
    selectionStart: start + lead + size,
    selectionEnd: start + lead + size + core.length,
  };
}

/** Wrap each line of a multi-line selection, leaving heading/list symbols outside. */
function wrapLines(value, start, end, marker) {
  const startsLine = start === 0 || value[start - 1] === '\n';
  const insert = value
    .slice(start, end)
    .split('\n')
    .map((segment, index) => {
      const prefix = index > 0 || startsLine ? segment.match(BLOCK_PREFIX_RE)[0] : '';
      const rest = segment.slice(prefix.length);
      const core = rest.trim();
      if (!core) return segment;
      const lead = rest.length - rest.trimStart().length;
      return prefix + rest.slice(0, lead) + marker + core + marker + rest.slice(lead + core.length);
    })
    .join('\n');
  return { from: start, to: end, insert, selectionStart: start, selectionEnd: start + insert.length };
}

/** 'h2' | 'h3' | 'bullet' | 'number' | null for one line. */
function lineKind(line) {
  if (/^\s*###\s/.test(line)) return 'h3';
  if (/^\s*#{1,6}\s/.test(line)) return 'h2';
  if (/^\s*[-*+]\s/.test(line)) return 'bullet';
  if (/^\s*\d{1,9}[.)]\s/.test(line)) return 'number';
  return null;
}

function prefixFor(kind, number) {
  if (kind === 'h2') return '## ';
  if (kind === 'h3') return '### ';
  if (kind === 'bullet') return '- ';
  return `${number}. `;
}

/**
 * Heading ('h2'), subheading ('h3'), bullet list ('bullet') or numbered list
 * ('number') for every line the selection touches. Replaces any other
 * heading or list symbol; if every line already has this one, removes it.
 */
export function toggleLinePrefix(value, start, end, kind) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  // A selection ending at the very start of a line doesn't include that line.
  const searchFrom = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const foundEnd = value.indexOf('\n', searchFrom);
  const lineEnd = foundEnd === -1 ? value.length : foundEnd;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const filled = lines.filter((line) => line.trim());
  const removing = filled.length > 0 && filled.every((line) => lineKind(line) === kind);

  // Carry on the numbering of a list just above.
  let number = 0;
  if (kind === 'number' && lineStart > 0) {
    const previousStart = value.lastIndexOf('\n', lineStart - 2) + 1;
    const previous = value.slice(previousStart, lineStart - 1).match(/^\s*(\d{1,9})[.)]\s/);
    if (previous) number = Number(previous[1]);
  }

  const insert = lines
    .map((line) => {
      // Blank lines inside a multi-line selection stay blank.
      if (!line.trim() && lines.length > 1) return line;
      const body = line.replace(BLOCK_PREFIX_RE, '');
      if (removing) return body;
      number += 1;
      return prefixFor(kind, number) + body;
    })
    .join('\n');

  const collapsed = start === end;
  return {
    from: lineStart,
    to: lineEnd,
    insert,
    selectionStart: collapsed ? lineStart + insert.length : lineStart,
    selectionEnd: lineStart + insert.length,
  };
}

/**
 * Turn what someone typed into the link box into a link target, or null if
 * it isn't one we can use: emails become mailto:, bare domains get https://.
 */
export function normalizeLinkInput(input) {
  let value = String(input ?? '').trim();
  if (!value) return null;

  if (EMAIL_RE.test(value)) {
    value = `mailto:${value}`;
  } else if (/^tel:/i.test(value)) {
    value = value.replace(/[\s()-]/g, '');
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[/#]/.test(value) && DOMAIN_RE.test(value)) {
    value = `https://${value}`;
  }

  // Spaces and brackets would end the link early.
  value = value.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  return isSafeHref(value) ? value : null;
}

/**
 * Link the selection to `href`. With nothing selected, the address itself
 * (without "mailto:") becomes the link text. The cursor ends up after it.
 */
export function insertLink(value, start, end, href) {
  const selected = value.slice(start, end);
  const lead = selected.length - selected.trimStart().length;
  const core = selected.trim().replace(/\s*\n\s*/g, ' ');
  const label = (core || href.replace(/^(mailto|tel):/i, '')).replace(/([[\]])/g, '\\$1');
  const link = `[${label}](${href})`;
  const insert = selected.slice(0, lead) + link + (core ? selected.slice(lead + selected.trim().length) : '');
  const cursor = start + lead + link.length;
  return { from: start, to: end, insert, selectionStart: cursor, selectionEnd: cursor };
}

/**
 * Enter inside a list item: start the next item ("- " or the next number).
 * Enter on an empty item ends the list instead. Returns null when the cursor
 * isn't in a list item, so Enter works as normal.
 */
export function continueList(value, start, end) {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const foundEnd = value.indexOf('\n', start);
  const lineEnd = foundEnd === -1 ? value.length : foundEnd;

  const match = value.slice(lineStart, lineEnd).match(LIST_ITEM_RE);
  if (!match) return null;
  const [, indent, marker, space, rest] = match;
  if (start < lineStart + indent.length + marker.length + space.length) return null;

  if (!rest.trim()) {
    return { from: lineStart, to: lineEnd, insert: '', selectionStart: lineStart, selectionEnd: lineStart };
  }

  const nextMarker = /\d/.test(marker)
    ? `${Number(marker.slice(0, -1)) + 1}${marker.slice(-1)}`
    : marker;
  const insert = `\n${indent}${nextMarker} `;
  const cursor = start + insert.length;
  return { from: start, to: start, insert, selectionStart: cursor, selectionEnd: cursor };
}
