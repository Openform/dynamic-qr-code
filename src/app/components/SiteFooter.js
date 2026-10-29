import Link from "next/link"
import { LEGAL_PAGES } from "@/lib/legal"
import styles from "./SiteFooter.module.css"

/** Footer for the public pages (landing, legal). */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <span className={`gradient-text ${styles.brand}`}>QR Go</span>
        <nav aria-label="Legal" className={styles.links}>
          {LEGAL_PAGES.map((page) => (
            <Link key={page.slug} href={page.path} className={styles.link}>
              {page.title}
            </Link>
          ))}
        </nav>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} QR Go. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
