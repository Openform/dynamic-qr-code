/**
 * The sidebar's collapse button (app/components/shell/AppShell.js), as the
 * server draws it: the screen starts collapsed when the cookie says so, and
 * the button has a name for either width.
 */

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let pathname = '/dashboard/analytics';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { default: AppShell } = await import('../../app/components/shell/AppShell');

const user = { name: 'Thandi', avatar: null, isAdmin: false };
const render = (props = {}) =>
  renderToStaticMarkup(createElement(AppShell, { user, adminCounts: null, ...props }, createElement('p', null, 'Screen')));
const shellClass = (html) => html.match(/^<div class="([^"]*)"/)[1];

describe('the sidebar shell', () => {
  it('starts expanded without the cookie', () => {
    expect(shellClass(render())).not.toMatch(/collapsed/);
    expect(shellClass(render({ collapsed: false }))).not.toMatch(/collapsed/);
  });

  it('starts collapsed when the cookie says so, so it never jumps', () => {
    expect(shellClass(render({ collapsed: true }))).toMatch(/collapsed/);
  });

  it('has the button, named for both widths', () => {
    const html = render();
    const button = html.match(/<button type="button" class="[^"]*toggle[^"]*">.*?<\/button>/)[0];
    expect(button).toContain('Collapse sidebar');
    expect(button).toContain('Expand sidebar');
  });

  it("isn't drawn on screens without the sidebar", () => {
    pathname = '/dashboard/pages/12/preview';
    try {
      const html = render({ collapsed: true });
      expect(html).toBe('<p>Screen</p>');
    } finally {
      pathname = '/dashboard/analytics';
    }
  });
});
