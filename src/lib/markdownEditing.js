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

import { isSafeHref, isTableRow, readTableDivider, splitTableRow } from './markdown';

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

/* ---- Tables ---- */

/** The lines of the text, where each starts, and which line `position` is on. */
function locateLine(value, position) {
  const lines = value.split('\n');
  const starts = [];
  let offset = 0;
  let index = 0;
  for (let line = 0; line < lines.length; line += 1) {
    starts.push(offset);
    if (offset <= position) index = line;
    offset += lines[line].length + 1;
  }
  return { lines, starts, index };
}

/**
 * The table that line `index` is part of, the same way markdown.js reads it:
 * { header, divider, last } (line numbers), or null.
 */
function tableAround(lines, index) {
  if (!isTableRow(lines[index])) return null;
  let top = index;
  while (top > 0 && isTableRow(lines[top - 1])) top -= 1;

  // The first row with a line of dashes under it is the header; any rows
  // above it are an ordinary paragraph.
  let header = -1;
  for (let line = top; line <= index; line += 1) {
    if (line + 1 < lines.length && readTableDivider(lines[line + 1])) {
      header = line;
      break;
    }
  }
  if (header === -1) return null;

  let last = header + 1;
  while (last + 1 < lines.length && isTableRow(lines[last + 1])) last += 1;
  return { header, divider: header + 1, last };
}

function tableColumns(lines, table) {
  let columns = 1;
  for (let line = table.header; line <= table.last; line += 1) {
    columns = Math.max(columns, splitTableRow(lines[line]).length);
  }
  return columns;
}

/** "|  |  |": a row of empty cells. The cursor goes 2 in, inside the first. */
function emptyRow(columns) {
  return `|${'  |'.repeat(columns)}`;
}

/** Where to put the cursor in a cell: select its text, or sit inside it if it's empty. */
function cellSelection(cell, lineStart) {
  if (cell.text) return [lineStart + cell.start, lineStart + cell.end];
  const inside = lineStart + cell.segmentStart + (cell.segmentEnd > cell.segmentStart ? 1 : 0);
  return [inside, inside];
}

/**
 * A new table, `columns` wide and `rows` tall counting the header row, on
 * its own after the line the cursor is on (or in place of an empty line).
 * The first heading is selected, ready to type over.
 */
export function insertTable(value, start, end, columns, rows) {
  const cols = Math.max(1, Math.floor(columns) || 1);
  const bodyRows = Math.max(0, (Math.floor(rows) || 1) - 1);

  // A selection ending at the very start of a line doesn't include that line.
  const at = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const { lines, starts, index } = locateLine(value, at);
  // Inside a table, the new one goes after it rather than splitting it.
  const line = tableAround(lines, index)?.last ?? index;
  const lineStart = starts[line];
  const lineEnd = lineStart + lines[line].length;
  const blankLine = !lines[line].trim();
  const from = blankLine ? lineStart : lineEnd;

  const header = `| ${Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(' | ')} |`;
  const divider = `|${' --- |'.repeat(cols)}`;
  const table = [header, divider, ...Array.from({ length: bodyRows }, () => emptyRow(cols))].join('\n');

  // Keep a blank line between the table and the text around it.
  const before = value.slice(0, from);
  const after = value.slice(lineEnd);
  const lead = !before.trim() || /\n[ \t]*\n$/.test(before) ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after.trim() || /^\n[ \t]*\n/.test(after) ? '' : after.startsWith('\n') ? '\n' : '\n\n';

  const selectionStart = from + lead.length + 2;
  return {
    from,
    to: lineEnd,
    insert: lead + table + trail,
    selectionStart,
    selectionEnd: selectionStart + 'Column 1'.length,
  };
}

/**
 * Enter in a table: add an empty row under this one (under the header, from
 * the header or its line of dashes). Enter on an empty last row ends the
 * table instead. Returns null outside a table, so Enter works as normal.
 */
export function continueTable(value, start, end) {
  if (start !== end) return null;
  const { lines, starts, index } = locateLine(value, start);
  const table = tableAround(lines, index);
  if (!table) return null;
  // At the very start of the header, Enter makes room above the table as usual.
  if (index === table.header && start === starts[index]) return null;

  const inBody = index > table.divider;
  if (inBody && index === table.last && splitTableRow(lines[index]).every((cell) => !cell.text)) {
    const lineStart = starts[index];
    return {
      from: lineStart,
      to: lineStart + lines[index].length,
      insert: '',
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }

  const after = inBody ? index : table.divider;
  const at = starts[after] + lines[after].length;
  const cursor = at + 3; // past the new line and "| "
  return {
    from: at,
    to: at,
    insert: `\n${emptyRow(tableColumns(lines, table))}`,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

/**
 * Tab (or Shift + Tab, `backwards`) in a table: move to the next (or
 * previous) cell, skipping the line of dashes. Tab in the last cell adds a
 * new row. Returns null outside a table, and for Shift + Tab in the first
 * cell, so the key works as normal there.
 */
export function moveTableCell(value, start, end, backwards = false) {
  if (value.slice(start, end).includes('\n')) return null;
  const { lines, starts, index } = locateLine(value, start);
  const table = tableAround(lines, index);
  if (!table) return null;

  const cells = [];
  for (let line = table.header; line <= table.last; line += 1) {
    if (line === table.divider) continue;
    for (const cell of splitTableRow(lines[line])) cells.push({ ...cell, lineStart: starts[line] });
  }

  // The cell the cursor is in, or the last one before it (between rows, or
  // outside the "|"s at the ends of a row).
  let current = -1;
  while (current + 1 < cells.length && cells[current + 1].lineStart + cells[current + 1].segmentStart <= start) {
    current += 1;
  }
  const cell = cells[current];
  const inCell = Boolean(cell) && start <= cell.lineStart + cell.segmentEnd;
  const target = backwards ? (inCell ? current - 1 : current) : current + 1;

  if (target < 0) return null;
  if (target >= cells.length) {
    const at = starts[table.last] + lines[table.last].length;
    const cursor = at + 3;
    return {
      from: at,
      to: at,
      insert: `\n${emptyRow(tableColumns(lines, table))}`,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const [selectionStart, selectionEnd] = cellSelection(cells[target], cells[target].lineStart);
  return { from: start, to: start, insert: '', selectionStart, selectionEnd };
}
