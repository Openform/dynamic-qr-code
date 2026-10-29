import { describe, it, expect } from 'vitest';
import { buildScrollAnchors, mapScroll } from '../scrollSync';

describe('buildScrollAnchors', () => {
  it('runs from the top to the end of both panes', () => {
    expect(buildScrollAnchors([[100, 300], [400, 900]], 1000, 2000)).toEqual([
      [0, 0],
      [100, 300],
      [400, 900],
      [1000, 2000],
    ]);
  });

  it('skips points that go backwards or past the end of either pane', () => {
    expect(buildScrollAnchors([[100, 300], [90, 400], [200, 250], [600, 1900], [700, 2100]], 1000, 2000)).toEqual([
      [0, 0],
      [100, 300],
      [600, 1900],
      [1000, 2000],
    ]);
  });

  it('copes with a pane that has nothing to scroll', () => {
    expect(buildScrollAnchors([[100, 300]], 0, 2000)).toEqual([[0, 0]]);
    expect(buildScrollAnchors([], 500, 800)).toEqual([[0, 0], [500, 800]]);
  });
});

describe('mapScroll', () => {
  const anchors = [[0, 0], [100, 300], [400, 900], [1000, 2000]];

  it('lines up the matching blocks', () => {
    expect(mapScroll(anchors, 100, 0)).toBe(300);
    expect(mapScroll(anchors, 900, 1)).toBe(400);
  });

  it('interpolates between blocks', () => {
    expect(mapScroll(anchors, 250, 0)).toBe(600);
    expect(mapScroll(anchors, 600, 1)).toBe(250);
  });

  it('keeps the top and bottom together', () => {
    expect(mapScroll(anchors, 0, 0)).toBe(0);
    expect(mapScroll(anchors, 1000, 0)).toBe(2000);
    expect(mapScroll(anchors, 5000, 0)).toBe(2000);
    expect(mapScroll(anchors, -20, 1)).toBe(0);
  });

  it('stays at the top when there is nothing to scroll', () => {
    expect(mapScroll([[0, 0]], 120, 0)).toBe(0);
    expect(mapScroll([], 120, 0)).toBe(0);
  });
});
