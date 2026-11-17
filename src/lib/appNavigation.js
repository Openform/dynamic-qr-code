/**
 * The sidebar on the signed-in screens (/dashboard and /admin, drawn by
 * app/components/shell/AppShell.js): its links, which one a screen belongs
 * to, and the screens that show without it. Browser-safe, no JSX: the icons
 * are added by the sidebar itself.
 */

/** The main sections, for everyone. */
export const MAIN_NAV = [
  { id: 'codes', href: '/dashboard', label: 'Codes' },
  { id: 'pages', href: '/dashboard/pages', label: 'Pages' },
  { id: 'analytics', href: '/dashboard/analytics', label: 'Analytics' },
];

/**
 * The admin sections, listed under "Admin" while an admin is in one of them
 * (elsewhere a single "Admin" link stands for them all). `count` names the
 * number of open items shown beside the link, from the sidebar's
 * `adminCounts`.
 */
export const ADMIN_NAV = [
  { id: 'accounts', href: '/admin', label: 'Accounts' },
  { id: 'invites', href: '/admin/invites', label: 'Invite requests', count: 'invites' },
  { id: 'reports', href: '/admin/reports', label: 'Page reports', count: 'reports' },
  { id: 'platform-analytics', href: '/admin/analytics', label: 'Platform analytics' },
  { id: 'legal', href: '/admin/legal', label: 'Legal pages' },
];

/** Profile and password, opened from the account at the foot of the sidebar. */
export const SETTINGS_HREF = '/dashboard/settings';

/** Whether `pathname` is `base` or a screen below it. */
function within(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The sidebar link a screen belongs to: an id from MAIN_NAV or ADMIN_NAV,
 * 'settings', or null. Screens below a section belong to it (the page editor
 * to Pages, a reported page to Page reports).
 */
export function navItemFor(pathname) {
  const path = String(pathname ?? '').replace(/(.)\/+$/, '$1');
  if (path === '/dashboard') return 'codes';
  if (within(path, SETTINGS_HREF)) return 'settings';
  if (within(path, '/dashboard/pages')) return 'pages';
  if (within(path, '/dashboard/analytics')) return 'analytics';
  if (path === '/admin') return 'accounts';
  if (within(path, '/admin/pages')) return 'reports';
  for (const item of ADMIN_NAV) {
    if (item.href !== '/admin' && within(path, item.href)) return item.id;
  }
  return null;
}

/** True on the admin screens, where the admin sections are listed. */
export function isAdminScreen(pathname) {
  return within(String(pathname ?? ''), '/admin');
}

/**
 * Screens that fill the window without the sidebar: a campaign page's preview
 * (opened in its own tab) and an admin's view of a reported page, which have
 * their own bars.
 */
export function isFullScreen(pathname) {
  const path = String(pathname ?? '');
  return /^\/dashboard\/pages\/[^/]+\/preview\/?$/.test(path) || /^\/admin\/pages\/[^/]+\/?$/.test(path);
}

/**
 * The page editor, which needs the room and has its own bar at the top: on
 * computers the sidebar shrinks to icons there whatever the width (elsewhere
 * only on narrower laptop screens), so the form and the live preview keep
 * their width; on phones the menu bar scrolls away, leaving the editor's bar
 * with Save at the top.
 */
export function isEditorScreen(pathname) {
  return /^\/dashboard\/pages\/[^/]+\/?$/.test(String(pathname ?? ''));
}

/**
 * The cookie that keeps the sidebar collapsed to icons on computers, set by
 * the sidebar's toggle and read by the /dashboard and /admin layouts, so the
 * screen is drawn the right width from the start. Without it the sidebar is
 * expanded wherever there's room for it.
 */
export const SIDEBAR_COOKIE = 'qr-sidebar';

/** Whether a SIDEBAR_COOKIE value means collapsed. */
export function isSidebarCollapsed(value) {
  return value === 'collapsed';
}

/** Whether a `document.cookie` string has the sidebar collapsed. */
export function sidebarCollapsedIn(cookieHeader) {
  for (const part of String(cookieHeader ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SIDEBAR_COOKIE) return isSidebarCollapsed(value.join('='));
  }
  return false;
}

/**
 * What to assign to `document.cookie` to remember the sidebar collapsed (for
 * a year) or, when it's expanded again, to forget it. `secure` adds Secure,
 * for pages served over HTTPS.
 */
export function sidebarCookie(collapsed, { secure = false } = {}) {
  const value = collapsed ? 'collapsed; Max-Age=31536000' : '; Max-Age=0';
  return `${SIDEBAR_COOKIE}=${value}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}
