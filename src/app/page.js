import Link from "next/link"
import HeroQR from "./components/HeroQR"
import SiteHeader from "./components/SiteHeader"
import SiteFooter from "./components/SiteFooter"
import InviteRequestButton from "./components/InviteRequest"
import RevealObserver from "./components/landing/RevealObserver"
import SpotlightGrid from "./components/landing/SpotlightGrid"
import DestinationHistory from "./components/landing/DestinationHistory"
import ScansChart from "./components/landing/ScansChart"
import StyleMorph from "./components/landing/StyleMorph"
import { PACKAGES, formatRand } from "@/lib/packages"
import styles from "./page.module.css"

const USE_CASES = [
  "Restaurant menus",
  "Posters and flyers",
  "Product packaging",
  "Business cards",
  "Event signage",
  "Shop windows",
  "Brochures",
  "Name badges"
]

// Example data for the "Understand your audience" tile.
const CITIES = [
  { name: "Cape Town", share: 42 },
  { name: "Johannesburg", share: 31 },
  { name: "Durban", share: 12 }
]
const DEVICES = ["iOS 58%", "Android 40%", "Safari, Chrome, in-app"]
const COLLECTIONS = ["Winter menu · 4", "Packaging · 9", "Events · 3"]
const EXTRAS = ["QR codes or Data Matrix", "Download as PNG or SVG", "Export scans to CSV"]

const STEPS = [
  {
    title: "Create",
    text: "Paste your link, pick QR or Data Matrix, and style it with your colours, dot shape and logo."
  },
  {
    title: "Print or share",
    text: "Download a crisp PNG or SVG and put it on menus, packaging, posters or screens."
  },
  {
    title: "Track and update",
    text: "Watch scans come in, and point the code somewhere new whenever plans change. No reprint."
  }
]

function ArrowRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function Check() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" pathLength="1" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <RevealObserver />
      <SiteHeader />

      <main>
        {/* ---- Hero ---- */}
        <section className={styles.hero}>
          <div className={styles.heroBackdrop} aria-hidden="true" />
          <div className={`${styles.wrap} ${styles.heroInner}`}>
            <div className={styles.heroText}>
              <h1 className={styles.heroTitle}>
                <span className={`${styles.titleLine} ${styles.enter}`} style={{ "--d": "120ms" }}>
                  Print it once.
                </span>{" "}
                <span className={`${styles.titleLine} ${styles.enter}`} style={{ "--d": "240ms" }}>
                  <span className={styles.shimmer}>Change the link</span> whenever you like.
                </span>
              </h1>
              <p className={`${styles.heroLead} ${styles.enter}`} style={{ "--d": "380ms" }}>
                Whether it&apos;s a menu, brochure, product label or outdoor sign, you can update
                where your QR code leads without having to reprint anything. Create, customise and
                track your QR codes from one simple dashboard.
              </p>
            </div>

            <div className={`${styles.heroVisual} ${styles.enterVisual}`}>
              <div className={styles.heroGlow} aria-hidden="true" />
              <HeroQR />
            </div>
          </div>
        </section>

        {/* ---- Use cases ---- */}
        <section className={styles.marquee} aria-label="What people put QR Go codes on">
          <div className={`${styles.wrap} ${styles.marqueeInner}`}>
            <p className={styles.marqueeLabel}>Made for anything you print</p>
            <div className={styles.marqueeViewport}>
              <ul className={styles.marqueeTrack}>
                {[...USE_CASES, ...USE_CASES].map((item, i) => (
                  <li
                    key={i}
                    className={styles.marqueeItem}
                    aria-hidden={i >= USE_CASES.length || undefined}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2 data-reveal className={`${styles.h2} ${styles.reveal}`}>
                More than <span className="gradient-text">just a QR code</span>.
              </h2>
              <p
                data-reveal
                className={`${styles.sectionLead} ${styles.reveal}`}
                style={{ "--d": "120ms" }}
              >
                One dashboard to make, style, organise and track every code you&apos;ve put out in
                the world.
              </p>
            </div>

            <SpotlightGrid className={styles.bento}>
              <article
                data-reveal
                data-spotlight
                className={`${styles.tile} ${styles.tileWide} ${styles.reveal}`}
              >
                <div>
                  <h3>Change the destination. Keep the code.</h3>
                  <p>
                    Swap where a code goes in seconds. Every past destination is kept, with the
                    scans it got.
                  </p>
                </div>
                <DestinationHistory />
              </article>

              <article
                data-reveal
                data-spotlight
                className={`${styles.tile} ${styles.reveal}`}
                style={{ "--d": "120ms" }}
              >
                <div>
                  <h3>Track your scans</h3>
                  <p>Scans and unique scanners over time, and the days people scan most.</p>
                </div>
                <ScansChart />
              </article>

              <article data-reveal data-spotlight className={`${styles.tile} ${styles.reveal}`}>
                <div>
                  <h3>Understand your audience</h3>
                  <p>Country, region and city, plus phone and browser for each scan.</p>
                </div>
                <ul className={styles.bars} aria-label="Example: share of scans by city">
                  {CITIES.map((city, i) => (
                    <li key={city.name}>
                      <div className={styles.barLabel}>
                        <span>{city.name}</span>
                        <span>{city.share}%</span>
                      </div>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${city.share}%`, "--bar-delay": `${300 + i * 150}ms` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className={styles.chips}>
                  {DEVICES.map((device, i) => (
                    <span key={device} className={styles.chip} style={{ "--i": i }}>
                      {device}
                    </span>
                  ))}
                </div>
              </article>

              <article
                data-reveal
                data-spotlight
                className={`${styles.tile} ${styles.reveal}`}
                style={{ "--d": "120ms" }}
              >
                <div>
                  <h3>Make it your own</h3>
                  <p>Dot shapes, colours, gradients and your logo in the middle.</p>
                </div>
                <StyleMorph />
              </article>

              <article
                data-reveal
                data-spotlight
                className={`${styles.tile} ${styles.reveal}`}
                style={{ "--d": "240ms" }}
              >
                <div>
                  <h3>Everything in one place</h3>
                  <p>Group codes into collections and take your data with you.</p>
                </div>
                <div className={styles.chips}>
                  {COLLECTIONS.map((name, i) => (
                    <span
                      key={name}
                      className={`${styles.chip} ${i === 0 ? styles.chipActive : ""}`}
                      style={{ "--i": i }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
                <ul className={styles.checks}>
                  {EXTRAS.map((item, i) => (
                    <li key={item} style={{ "--i": i }}>
                      <Check />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </SpotlightGrid>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section id="how-it-works" className={styles.section}>
          <div className={styles.wrap}>
            <h2 data-reveal className={`${styles.h2} ${styles.reveal}`}>
              Get started in three simple steps
            </h2>
            <ol data-reveal className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step.title} className={styles.step} style={{ "--i": i }}>
                  <span className={styles.stepTrack} aria-hidden="true">
                    <span className={styles.stepFill} />
                  </span>
                  <span className={styles.stepNum}>0{i + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---- Plans ---- */}
        <section id="plans" className={`${styles.section} ${styles.plansSection}`}>
          <div className={styles.wrap}>
            <div className={styles.centerHead}>
              <h2 data-reveal className={`${styles.h2} ${styles.reveal}`}>
                Simple pricing. No surprises.
              </h2>
              <p
                data-reveal
                className={`${styles.sectionLead} ${styles.reveal}`}
                style={{ "--d": "120ms" }}
              >
                Every plan includes dynamic QR codes, custom styling, scan analytics and your own
                management dashboard. Simply choose how many codes you need.
              </p>
            </div>

            <ul className={styles.plans}>
              {PACKAGES.map((pkg, i) => (
                <li
                  key={pkg.id}
                  data-reveal
                  className={styles.reveal}
                  style={{ "--d": `${i * 90}ms` }}
                >
                  <div className={styles.planCard}>
                    <h3 className={styles.planName}>{pkg.name}</h3>
                    {pkg.yearlyPrice === null ? (
                      <p className={styles.planPrice}>
                        Custom <span className={styles.planPer}>pricing</span>
                      </p>
                    ) : (
                      <p className={styles.planPrice}>
                        {formatRand(pkg.yearlyPrice)}
                        <span className={styles.planPer}>/year</span>
                      </p>
                    )}
                    <p className={styles.planLimit}>
                      {pkg.limit === null ? (
                        "Tailored to your requirements"
                      ) : (
                        <>
                          Up to <strong>{pkg.limit}</strong> dynamic QR codes
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div data-reveal className={`${styles.plansCta} ${styles.reveal}`}>
              <InviteRequestButton className={`btn btn-primary ${styles.bigBtn}`} id="plans-signup" />
              <p className={styles.plansNote}>
                All prices exclude VAT. Annual licences are renewable every 12 months.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Final call to action ---- */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <div data-reveal className={`${styles.ctaFrame} ${styles.reveal}`}>
              <div className={styles.ctaInner}>
                <div className={styles.ctaGlow} aria-hidden="true" />
                <h2 className={styles.h2}>Ready to get started?</h2>
                <p className={styles.sectionLead}>
                  Choose a package that suits your needs and we&apos;ll help you get started.
                  Already have an account? Simply sign in.
                </p>
                <div className={styles.ctaButtons}>
                  <InviteRequestButton
                    className={`btn btn-primary ${styles.bigBtn}`}
                    id="cta-get-started"
                    openOnHash
                  />
                  <Link href="/login" className={styles.arrowLink}>
                    Sign in <ArrowRight />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
