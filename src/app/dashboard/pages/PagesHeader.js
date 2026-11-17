import Link from "next/link"
import styles from "./pages.module.css"

const LINKS = [
  { id: "codes", href: "/dashboard", label: "Codes" },
  { id: "pages", href: "/dashboard/pages", label: "Pages" },
  { id: "analytics", href: "/dashboard/analytics", label: "Analytics" }
]

/**
 * The header on the campaign page screens. `current` marks the open section.
 * It stays at the top while scrolling, unless `sticky` is false (the editor
 * keeps its own bar there instead).
 */
export default function PagesHeader({ current = "pages", sticky = true }) {
  return (
    <header className={`${styles.header}${sticky ? ` ${styles.headerSticky}` : ""}`}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/dashboard">
          <span className={`gradient-text ${styles.logo}`}>QR Go</span>
        </Link>
        <nav className={styles.nav} aria-label="Dashboard">
          {LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={`btn btn-ghost btn-sm${link.id === current ? ` ${styles.navOn}` : ""}`}
              aria-current={link.id === current ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
