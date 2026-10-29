import SiteHeader from "../components/SiteHeader"
import SiteFooter from "../components/SiteFooter"
import styles from "./legal.module.css"

/** Shared shell for /privacy and /terms. */
export default function LegalLayout({ children }) {
  return (
    <div className="page-wrapper">
      <div
        className="gradient-orb gradient-orb-cyan"
        style={{ width: "420px", height: "420px", top: "-200px", right: "-120px" }}
      />
      <div
        className="gradient-orb gradient-orb-purple"
        style={{ width: "360px", height: "360px", bottom: "120px", left: "-180px" }}
      />

      <SiteHeader />

      <main className={styles.main}>
        <div className="container">
          <article className={styles.article}>{children}</article>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
