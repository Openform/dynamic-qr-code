import Link from "next/link"
import styles from "../legal.module.css"

// Placeholder content — replace with the final policy before launch.

export const metadata = {
  title: "Privacy Policy — QR Go",
  description: "How QR Go collects, uses and protects your information."
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: 29 October 2026</p>
      </header>

      <div className={styles.prose}>
        <p>
          This Privacy Policy explains what information QR Go (“we”, “us”)
          collects when you use our dynamic QR code service, how we use it, and
          the choices you have. By using QR Go you agree to the practices
          described here.
        </p>

        <h2 id="information-we-collect">1. Information we collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address and
            password. Passwords are stored as a secure hash and are never
            visible to us.
          </li>
          <li>
            <strong>QR code content</strong> — the names, destination links,
            collections and design settings of the QR codes you create.
          </li>
          <li>
            <strong>Scan data</strong> — when someone scans one of your codes we
            record the time of the scan, an approximate location (country and
            city), the device type, operating system, browser and preferred
            language.
          </li>
        </ul>
        <p>
          We do not store the IP address of people who scan your codes. It is
          used briefly to estimate location and to create an anonymous
          identifier for counting unique scans, then discarded.
        </p>

        <h2 id="how-we-use-information">2. How we use your information</h2>
        <ul>
          <li>To create, host and redirect your dynamic QR codes.</li>
          <li>To show you analytics about how your codes are being scanned.</li>
          <li>To manage your account, plan and security.</li>
          <li>To contact you about important changes to the service.</li>
          <li>To detect and prevent abuse, fraud and misuse of the service.</li>
        </ul>

        <h2 id="cookies">3. Cookies</h2>
        <p>
          We use a single essential cookie to keep you signed in. It lasts for
          seven days and is removed when you sign out. We do not use
          advertising or third-party tracking cookies.
        </p>

        <h2 id="sharing">4. Sharing your information</h2>
        <p>
          We do not sell your personal information. We only share it with
          service providers who help us run QR Go (such as hosting providers),
          under agreements that require them to protect it, or when we are
          required to by law.
        </p>

        <h2 id="retention">5. How long we keep it</h2>
        <p>
          Detailed scan records are kept for 24 months and then deleted; the
          total scan count for each code is kept. Account details and QR codes
          are kept for as long as your account is open. When you close your
          account we delete your data within a reasonable period, unless we
          need to keep some of it to meet legal obligations.
        </p>

        <h2 id="security">6. Security</h2>
        <p>
          We use industry-standard measures to protect your information,
          including encrypted connections and hashed passwords. No system is
          perfectly secure, so we cannot guarantee absolute security.
        </p>

        <h2 id="your-rights">7. Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access,
          correct, export or delete your personal information, and to object
          to how we use it. You can update most of your details from your
          account settings, or contact us to make a request.
        </p>

        <h2 id="children">8. Children</h2>
        <p>
          QR Go is not intended for children under 16, and we do not knowingly
          collect information from them.
        </p>

        <h2 id="changes">9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. If we make significant
          changes we will let you know by email or through the service. The
          date at the top of this page shows when it was last updated.
        </p>

        <h2 id="contact">10. Contact us</h2>
        <p>
          If you have questions about this policy or your information, email
          us at <a href="mailto:privacy@example.com">privacy@example.com</a>.
          See also our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </div>
    </>
  )
}
