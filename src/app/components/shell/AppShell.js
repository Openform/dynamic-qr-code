"use client"

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import Avatar from "@/app/dashboard/components/Avatar"
import {
  ADMIN_NAV,
  MAIN_NAV,
  SETTINGS_HREF,
  isAdminScreen,
  isEditorScreen,
  isFullScreen,
  navItemFor,
  sidebarCollapsedIn,
  sidebarCookie
} from "@/lib/appNavigation"
import {
  ChartIcon,
  CloseIcon,
  FlagIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  PanelLeftIcon,
  QrCodeIcon,
  ScaleIcon,
  ShieldIcon,
  SmartphoneIcon,
  UsersIcon
} from "../icons"
import { LeaveGuardContext, createLeaveGuard, useConfirmLeave } from "./leaveGuard"
import styles from "./AppShell.module.css"

const ICONS = {
  codes: QrCodeIcon,
  pages: SmartphoneIcon,
  analytics: ChartIcon,
  admin: ShieldIcon,
  accounts: UsersIcon,
  invites: MailIcon,
  reports: FlagIcon,
  "platform-analytics": ChartIcon,
  legal: ScaleIcon
}

// Phones and small tablets get the menu bar instead of the sidebar. The
// same width as in AppShell.module.css.
const PHONE_QUERY = "(max-width: 960px)"

function subscribeToWidth(callback) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function usePhoneLayout() {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}

// Narrower laptop screens, where the sidebar is icons unless it's opened
// over the screen. The same width as in AppShell.module.css.
const NARROW_QUERY = "(max-width: 1199px)"

// Whether the sidebar is collapsed lives in a cookie (see SIDEBAR_COOKIE in
// lib/appNavigation.js), so the server draws each screen the right width and
// the /dashboard and /admin screens agree.
const collapsedListeners = new Set()

function subscribeToCollapsed(callback) {
  collapsedListeners.add(callback)
  return () => collapsedListeners.delete(callback)
}

function readCollapsed() {
  return sidebarCollapsedIn(document.cookie)
}

function saveCollapsed(collapsed) {
  document.cookie = sidebarCookie(collapsed, { secure: window.location.protocol === "https:" })
  for (const listener of collapsedListeners) listener()
}

/** `collapsedOnServer` is the cookie as the layout read it. */
function useCollapsed(collapsedOnServer) {
  return useSyncExternalStore(subscribeToCollapsed, readCollapsed, () => collapsedOnServer)
}

/**
 * The frame around the signed-in screens (/dashboard and /admin, from their
 * layouts): a sidebar with the sections, the admin sections for admins, and
 * the account with Log out. Below 1200px wide, and always in the page
 * editor, the sidebar shrinks to icons with their names on hover; on phones
 * it's a menu bar whose Menu button slides the sidebar in.
 *
 * The button at the top of the sidebar collapses it to icons, or expands it
 * again, on any computer screen; the choice is kept in a cookie. Where it's
 * icons only for want of room (narrower screens, the editor), expanding it
 * opens it over the screen until a section is chosen, Escape is pressed or
 * the screen is clicked.
 *
 * `user` is `{ name, avatar, isAdmin }` (null if it couldn't be loaded),
 * `adminCounts` the open `{ invites, reports }` for admins, and `collapsed`
 * whether the sidebar's cookie has it collapsed. A campaign page's
 * preview and an admin's view of a reported page show without the frame
 * (lib/appNavigation.js).
 *
 * Screens with unsaved work warn before a sidebar link leaves them: see
 * useLeaveWarning in ./leaveGuard.js.
 */
export default function AppShell({ user, adminCounts, collapsed: collapsedOnServer = false, children }) {
  const pathname = usePathname()
  const [guard] = useState(createLeaveGuard)
  const phone = usePhoneLayout()
  const collapsed = useCollapsed(collapsedOnServer)
  // The menu stays open on the screen it was opened on, so going to another
  // screen closes it, as does widening the window past phone size.
  const [menuOpenOn, setMenuOpenOn] = useState(null)
  const menuOpen = phone && menuOpenOn === pathname
  // Likewise the sidebar opened over the screen where there's no room for it.
  const [overlayOn, setOverlayOn] = useState(null)
  const overlay = !phone && overlayOn === pathname
  const sidebarRef = useRef(null)

  // A click outside the sidebar opened over the screen, or Escape, closes it.
  useEffect(() => {
    if (!overlay) return
    const close = () => setOverlayOn(null)
    const onPointerDown = (event) => {
      if (!sidebarRef.current?.contains(event.target)) close()
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [overlay])

  if (isFullScreen(pathname)) {
    return <LeaveGuardContext value={guard}>{children}</LeaveGuardContext>
  }

  const closeMenu = () => setMenuOpenOn(null)
  const closeOverlay = () => setOverlayOn(null)

  // The sidebar's own button. It reads "Collapse" while the sidebar is wide
  // and "Expand" while it's icons (AppShell.module.css), whatever the reason.
  // Where there's no room to keep it expanded, it opens over the screen for
  // a moment, leaving the choice kept for wider screens as it is.
  function toggleSidebar() {
    if (overlay) {
      closeOverlay()
    } else if (noRoomForSidebar(pathname)) {
      setOverlayOn(pathname)
    } else {
      saveCollapsed(!collapsed)
    }
  }

  const shellClasses = [
    styles.shell,
    isEditorScreen(pathname) && styles.editorScreen,
    collapsed && styles.collapsed,
    overlay && styles.overlay
  ]

  return (
    <LeaveGuardContext value={guard}>
      <div className={shellClasses.filter(Boolean).join(" ")}>
        <a href="#content" className={styles.skip}>
          Skip to content
        </a>

        <header ref={sidebarRef} className={styles.sidebar}>
          <Sidebar
            user={user}
            adminCounts={adminCounts}
            pathname={pathname}
            onNavigate={closeOverlay}
            onToggle={toggleSidebar}
          />
        </header>

        <header className={styles.menuBar}>
          <Link href="/dashboard" className={`gradient-text ${styles.logo}`} onClick={(e) => guard.confirm() || e.preventDefault()}>
            QR Go
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? "app-menu" : undefined}
            onClick={() => setMenuOpenOn(pathname)}
          >
            <MenuIcon size={18} />
            Menu
          </button>
        </header>

        {menuOpen && (
          <MenuDrawer onClose={closeMenu}>
            <Sidebar user={user} adminCounts={adminCounts} pathname={pathname} onNavigate={closeMenu} onClose={closeMenu} />
          </MenuDrawer>
        )}

        <div id="content" tabIndex={-1} className={styles.content}>
          {children}
        </div>
      </div>
    </LeaveGuardContext>
  )
}

/**
 * Whether the window or the screen leaves the sidebar only room for icons
 * (narrower laptop screens and the page editor).
 */
function noRoomForSidebar(pathname) {
  return isEditorScreen(pathname) || window.matchMedia(NARROW_QUERY).matches
}

/**
 * The sidebar's contents, in the sidebar on computers and in the menu on
 * phones. `onNavigate` runs when a link is followed, `onToggle` adds the
 * button that collapses and expands it (the sidebar), and `onClose` a close
 * button (the menu).
 */
function Sidebar({ user, adminCounts, pathname, onNavigate, onToggle, onClose }) {
  const confirmLeave = useConfirmLeave()
  const guard = useContext(LeaveGuardContext)
  const adminLabel = useId()
  const current = navItemFor(pathname)
  const isAdmin = Boolean(user?.isAdmin)
  const inAdmin = isAdmin && isAdminScreen(pathname)
  const counts = adminCounts ?? {}
  const countFor = (item) => (item.count ? (counts[item.count] ?? 0) : 0)
  const openTotal = (counts.invites ?? 0) + (counts.reports ?? 0)

  // Following a link asks first if the screen has unsaved work.
  function follow(event, href) {
    if (href !== pathname && !confirmLeave()) {
      event.preventDefault()
      return
    }
    onNavigate?.()
  }

  async function logOut() {
    if (!confirmLeave()) return
    // They've agreed to lose unsaved work, so the browser needn't ask again.
    guard?.release()
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("Logout failed:", error)
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page load, so nothing from the signed-out session stays in memory
    window.location.href = "/"
  }

  function item({ id, href, label }, count = 0) {
    const Icon = ICONS[id]
    const on = current === id || (id === "admin" && isAdminScreen(pathname))
    return (
      <li key={id}>
        <Link
          href={href}
          className={styles.item}
          aria-current={on ? (pathname === href ? "page" : "true") : undefined}
          onClick={(event) => follow(event, href)}
        >
          <Icon size={18} className={styles.icon} />
          <span className={styles.label}>
            {label}
            {count > 0 && <span className={styles.srOnly}>, {count} open</span>}
          </span>
          {count > 0 && (
            <span className={styles.count} aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.brand}>
        <Link href="/dashboard" className={`gradient-text ${styles.logo}`} onClick={(event) => follow(event, "/dashboard")}>
          QR Go
        </Link>
        {onToggle && (
          // Both labels are here; the stylesheet shows the one that fits how
          // wide the sidebar is, and turns the arrow round as it narrows.
          <button type="button" className={styles.toggle} onClick={onToggle}>
            <PanelLeftIcon size={18} chevronClassName={styles.chevron} />
            <span className={styles.label}>
              <span className={styles.whenWide}>Collapse sidebar</span>
              <span className={styles.whenIcons}>Expand sidebar</span>
            </span>
          </button>
        )}
        {onClose && (
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close menu">
            <CloseIcon size={20} />
          </button>
        )}
      </div>

      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.list}>
          {MAIN_NAV.map((link) => item(link))}
          {isAdmin && !inAdmin && (
            <>
              <li className={styles.divider} aria-hidden="true" />
              {item({ id: "admin", href: "/admin", label: "Admin" }, openTotal)}
            </>
          )}
        </ul>

        {inAdmin && (
          <div className={styles.group}>
            <p id={adminLabel} className={styles.groupLabel}>
              Admin
            </p>
            <ul className={styles.list} aria-labelledby={adminLabel}>
              {ADMIN_NAV.map((link) => item(link, countFor(link)))}
            </ul>
          </div>
        )}
      </nav>

      <div className={styles.footer}>
        <Link
          href={SETTINGS_HREF}
          className={`${styles.item} ${styles.account}`}
          aria-current={current === "settings" ? "page" : undefined}
          onClick={(event) => follow(event, SETTINGS_HREF)}
        >
          <Avatar src={user?.avatar} name={user?.name} size={28} />
          <span className={styles.label}>
            <span className={styles.accountName}>{user?.name || "Your account"}</span>
            <span className={styles.accountHint}>Settings</span>
          </span>
        </Link>
        <button type="button" className={styles.item} onClick={logOut}>
          <LogOutIcon size={18} className={styles.icon} />
          <span className={styles.label}>Log out</span>
        </button>
      </div>
    </div>
  )
}

/** The phone menu: the sidebar sliding in from the left, as a modal dialog. */
function MenuDrawer({ onClose, children }) {
  const ref = useRef(null)

  // A layout effect, so it closes before React removes it: closing puts focus
  // back on the Menu button, which removing it open wouldn't.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      id="app-menu"
      className={styles.drawer}
      aria-label="Menu"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // A click on the dimmed page beside the menu lands on the dialog itself.
      onClick={(event) => event.target === ref.current && onClose()}
    >
      <div className={styles.drawerPanel}>{children}</div>
    </dialog>
  )
}
