import Link from "next/link"
import styles from "../legal.module.css"

// Placeholder content — replace with the final terms before launch.

export const metadata = {
  title: "Terms & Conditions — QR Go",
  description: "The terms that apply when you use QR Go."
}

export default function TermsPage() {
  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Terms &amp; Conditions</h1>
        <p className={styles.updated}>Last updated: 29 October 2026</p>
      </header>

      <div className={styles.prose}>
        <p>
          These Terms &amp; Conditions (“Terms”) govern your use of QR Go (“we”,
          “us”), including our website, dashboard and dynamic QR code service.
          Please read them carefully before using the service.
        </p>

        <h2 id="acceptance">1. Acceptance of these terms</h2>
        <p>
          By creating an account or using QR Go, you agree to these Terms and
          to our <Link href="/privacy">Privacy Policy</Link>. If you do not
          agree, please do not use the service.
        </p>

        <h2 id="the-service">2. The service</h2>
        <p>
          QR Go lets you create dynamic QR codes whose destinations can be
          changed after they are printed, and view analytics about how they
          are scanned. Features and usage limits depend on the plan assigned
          to your account.
        </p>

        <h2 id="accounts">3. Your account</h2>
        <ul>
          <li>You must give accurate information when you sign up.</li>
          <li>
            You are responsible for keeping your password safe and for all
            activity on your account.
          </li>
          <li>
            Tell us straight away if you think someone has accessed your
            account without permission.
          </li>
        </ul>

        <h2 id="acceptable-use">4. Acceptable use</h2>
        <p>You agree not to use QR Go to link to or distribute:</p>
        <ul>
          <li>Phishing, scams, malware or other harmful content.</li>
          <li>Anything illegal, or that infringes someone else’s rights.</li>
          <li>Spam, or content that is abusive, hateful or misleading.</li>
        </ul>
        <p>
          You also agree not to interfere with the service, try to access it
          in unauthorised ways, or use it to overload our systems.
        </p>

        <h2 id="your-content">5. Your content</h2>
        <p>
          You keep ownership of the content you add to QR Go, such as code
          names and destination links. You give us permission to store and
          process it only as needed to provide the service. You are
          responsible for making sure your destinations are lawful and that
          you have the right to use them.
        </p>

        <h2 id="availability">6. Availability of your codes</h2>
        <p>
          Dynamic QR codes rely on our service to redirect each scan. If the
          service is unavailable, or your account is suspended or closed, your
          codes will stop redirecting to their destinations. We aim to keep
          QR Go running reliably but do not guarantee uninterrupted access.
        </p>

        <h2 id="suspension">7. Suspension and termination</h2>
        <p>
          We may suspend or close your account if you break these Terms or if
          your use of the service puts others at risk. You can stop using
          QR Go at any time.
        </p>

        <h2 id="disclaimers">8. Disclaimers</h2>
        <p>
          QR Go is provided “as is” and “as available”. To the extent allowed
          by law, we make no warranties of any kind, whether express or
          implied, about the service.
        </p>

        <h2 id="liability">9. Limitation of liability</h2>
        <p>
          To the extent allowed by law, we are not liable for any indirect,
          incidental or consequential loss arising from your use of QR Go,
          including lost profits, lost data or the cost of reprinting
          materials.
        </p>

        <h2 id="changes">10. Changes to these terms</h2>
        <p>
          We may update these Terms from time to time. If we make significant
          changes we will let you know by email or through the service.
          Continuing to use QR Go after changes take effect means you accept
          the updated Terms.
        </p>

        <h2 id="governing-law">11. Governing law</h2>
        <p>
          These Terms are governed by the laws of [Jurisdiction], and any
          disputes will be handled by the courts of that jurisdiction.
        </p>

        <h2 id="contact">12. Contact us</h2>
        <p>
          If you have questions about these Terms, email us at{" "}
          <a href="mailto:legal@example.com">legal@example.com</a>.
        </p>
      </div>
    </>
  )
}
