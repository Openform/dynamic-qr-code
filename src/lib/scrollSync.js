/**
 * Keep two scrolling panes lined up (the legal page editor and its preview).
 *
 * Each block of the page (heading, paragraph, list) has a position in both
 * panes: where its line of text sits in the editor, and where it's drawn in
 * the preview. Those pairs become "anchors" [editorY, previewY], and a scroll
 * position in one pane maps to the other by interpolating between the two
 * anchors either side of it. So both panes show the same section even though
 * headings and spacing take up different room in each.
 */

/**
 * Build the anchors from block positions `points` ([editorY, previewY], in
 * page order) and each pane's furthest scroll position. Always starts at
 * [0, 0] and ends at [maxEditor, maxPreview] so both panes reach their top
 * and bottom together. Points that go backwards or past the end are skipped.
 */
export function buildScrollAnchors(points, maxEditor, maxPreview) {
  const anchors = [[0, 0]];
  for (const [editorY, previewY] of points) {
    const [lastEditor, lastPreview] = anchors[anchors.length - 1];
    if (editorY >= maxEditor || previewY >= maxPreview) break;
    if (editorY <= lastEditor || previewY <= lastPreview) continue;
    anchors.push([editorY, previewY]);
  }
  const [lastEditor, lastPreview] = anchors[anchors.length - 1];
  if (maxEditor > lastEditor && maxPreview > lastPreview) {
    anchors.push([maxEditor, maxPreview]);
  }
  return anchors;
}

/**
 * Map a scroll position from one pane to the other. `from` is 0 when `value`
 * is the editor's scroll position (returns the preview's), 1 for the reverse.
 */
export function mapScroll(anchors, value, from) {
  const to = 1 - from;
  if (anchors.length < 2) return anchors[0]?.[to] ?? 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const start = anchors[i];
    const end = anchors[i + 1];
    if (value <= end[from] || i === anchors.length - 2) {
      const span = end[from] - start[from];
      const progress = span > 0 ? Math.min(1, Math.max(0, (value - start[from]) / span)) : 0;
      return start[to] + progress * (end[to] - start[to]);
    }
  }
  return 0;
}
