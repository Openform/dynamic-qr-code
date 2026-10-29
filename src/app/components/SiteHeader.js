import Link from "next/link"
import { getSignupCta } from "@/lib/signup"
import CtaLink from "./CtaLink"
import styles from "./SiteHeader.module.css"

/** Top bar for the public pages (landing, legal). */
export default function SiteHeader() {
  const cta = getSignupCta()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={`gradient-text ${styles.logo}`}>
          QR Go
        </Link>

        <nav aria-label="Main" className={styles.nav}>
          <Link href="/#features" className={styles.navLink}>
            Features
          </Link>
          <Link href="/#how-it-works" className={styles.navLink}>
            How it works
          </Link>
          <Link href="/#plans" className={styles.navLink}>
            Plans
          </Link>
        </nav>

        <div className={styles.actions}>
          <Link href="/login" className={styles.signIn} id="nav-signin">
            Sign in
          </Link>
          <CtaLink
            cta={cta}
            className={`btn btn-primary btn-sm ${styles.cta}`}
            id="nav-signup"
          />
        </div>
      </div>
    </header>
  )
}
