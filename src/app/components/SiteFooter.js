import Link from "next/link"
import styles from "./SiteFooter.module.css"

/** Footer for the public pages (landing, legal). */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <span className={`gradient-text ${styles.brand}`}>QR Go</span>
        <nav aria-label="Legal" className={styles.links}>
          <Link href="/privacy" className={styles.link}>
            Privacy Policy
          </Link>
          <Link href="/terms" className={styles.link}>
            Terms &amp; Conditions
          </Link>
        </nav>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} QR Go. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
