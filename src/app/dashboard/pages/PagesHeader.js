import Link from "next/link"
import styles from "./pages.module.css"

const LINKS = [
  { id: "codes", href: "/dashboard", label: "Codes" },
  { id: "pages", href: "/dashboard/pages", label: "Pages" },
  { id: "analytics", href: "/dashboard/analytics", label: "Analytics" }
]

/** The header on the campaign page screens. `current` marks the open section. */
export default function PagesHeader({ current = "pages" }) {
  return (
    <header className={styles.header}>
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
