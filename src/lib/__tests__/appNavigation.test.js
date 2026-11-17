import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV,
  MAIN_NAV,
  SIDEBAR_COOKIE,
  isAdminScreen,
  isEditorScreen,
  isFullScreen,
  isSidebarCollapsed,
  navItemFor,
  sidebarCollapsedIn,
  sidebarCookie,
} from '../appNavigation';

describe('navItemFor', () => {
  it('marks each section on its own screen', () => {
    for (const item of [...MAIN_NAV, ...ADMIN_NAV]) {
      expect(navItemFor(item.href)).toBe(item.id);
    }
    expect(navItemFor('/dashboard/settings')).toBe('settings');
  });

  it('marks the section a screen below it belongs to', () => {
    expect(navItemFor('/dashboard/pages/12')).toBe('pages');
    expect(navItemFor('/dashboard/pages/12/preview')).toBe('pages');
    expect(navItemFor('/admin/pages/12')).toBe('reports');
  });

  it("doesn't mistake a section for one whose address starts the same", () => {
    expect(navItemFor('/dashboard/pagesx')).toBeNull();
    expect(navItemFor('/admin/legalese')).toBeNull();
    expect(navItemFor('/administrator')).toBeNull();
  });

  it('ignores a slash on the end, and copes with no path', () => {
    expect(navItemFor('/dashboard/')).toBe('codes');
    expect(navItemFor('/admin/reports/')).toBe('reports');
    expect(navItemFor(undefined)).toBeNull();
    expect(navItemFor('/')).toBeNull();
  });
});

describe('isAdminScreen', () => {
  it('is true on /admin and below it only', () => {
    expect(isAdminScreen('/admin')).toBe(true);
    expect(isAdminScreen('/admin/reports')).toBe(true);
    expect(isAdminScreen('/dashboard')).toBe(false);
    expect(isAdminScreen('/administrator')).toBe(false);
  });
});

describe('isFullScreen', () => {
  it("is true on a page's preview and an admin's view of a reported page", () => {
    expect(isFullScreen('/dashboard/pages/12/preview')).toBe(true);
    expect(isFullScreen('/admin/pages/12')).toBe(true);
  });

  it('is false on the screens with the sidebar', () => {
    for (const path of ['/dashboard', '/dashboard/pages', '/dashboard/pages/12', '/admin', '/admin/reports']) {
      expect(isFullScreen(path)).toBe(false);
    }
  });
});

describe('isEditorScreen', () => {
  it("is true on a page's editor only", () => {
    expect(isEditorScreen('/dashboard/pages/12')).toBe(true);
    expect(isEditorScreen('/dashboard/pages')).toBe(false);
    expect(isEditorScreen('/dashboard/pages/12/preview')).toBe(false);
  });
});

describe('the sidebar cookie', () => {
  it('means collapsed only when it says so', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    for (const value of [undefined, null, '', 'expanded', 'Collapsed', '1']) {
      expect(isSidebarCollapsed(value)).toBe(false);
    }
  });

  it('is found among the other cookies', () => {
    expect(sidebarCollapsedIn(`${SIDEBAR_COOKIE}=collapsed`)).toBe(true);
    expect(sidebarCollapsedIn(`a=1; ${SIDEBAR_COOKIE}=collapsed; b=2`)).toBe(true);
    expect(sidebarCollapsedIn(`a=1; ${SIDEBAR_COOKIE}=; b=2`)).toBe(false);
    expect(sidebarCollapsedIn(`x${SIDEBAR_COOKIE}=collapsed`)).toBe(false);
    expect(sidebarCollapsedIn('')).toBe(false);
    expect(sidebarCollapsedIn(undefined)).toBe(false);
  });

  it('is kept for a year when collapsed, and removed when expanded', () => {
    expect(sidebarCookie(true)).toBe(`${SIDEBAR_COOKIE}=collapsed; Max-Age=31536000; Path=/; SameSite=Lax`);
    expect(sidebarCookie(false)).toBe(`${SIDEBAR_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`);
    expect(sidebarCookie(true, { secure: true })).toMatch(/; Secure$/);
  });

  it('reads back as it was written', () => {
    expect(sidebarCollapsedIn(sidebarCookie(true).split(';')[0])).toBe(true);
    expect(sidebarCollapsedIn(sidebarCookie(false).split(';')[0])).toBe(false);
  });
});
