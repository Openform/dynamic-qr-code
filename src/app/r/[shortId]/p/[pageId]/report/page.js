import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { CheckCircleIcon, FlagIcon } from "@/app/components/icons"
import { REPORT_HONEYPOT, REPORT_MESSAGE_MAX, REPORT_REASONS } from "@/lib/pageReports"
import { pagePath, pageReportPath } from "@/lib/pageReference"
import { loadPublicPage } from "@/lib/publicPage"
import { UNLOCK_COOKIE } from "@/lib/unlock"
import styles from "./report.module.css"

/**
 * GET /r/[shortId]/p/[pageId]/report — "Report this page", linked from the
 * footer of every campaign page. It checks the code and page like the page
 * does, so only a page you can see can be reported. The form posts to
 * ./send without needing JavaScript, which sends the visitor back here:
 *   ?sent=1        the report was saved
 *   ?error=<what>  it wasn't: reason, message, busy (rate limit) or failed
 *
 * Like the password page, this is QR Go speaking, not the business, so it
 * uses QR Go's look rather than the page's theme.
 *
 * NOTE: In Next.js 16, `params` and `searchParams` are Promises.
 */

export const metadata = {
  title: "Report this page — QR Go",
  robots: { index: false, follow: false }
}

const ERRORS = {
  reason: "Choose what’s wrong with the page.",
  message: "Keep the message to 1,000 characters or fewer.",
  busy: "You’ve sent a few reports already. Please try again in an hour.",
  failed: "Your report couldn’t be sent just now. Please try again in a few minutes."
}

const one = (value) => (Array.isArray(value) ? value[0] : value)

export default async function ReportPage({ params, searchParams }) {
  const { shortId, pageId } = await params
  const query = await searchParams
  const unlockToken = (await cookies()).get(UNLOCK_COOKIE)?.value
  const result = await loadPublicPage({ shortId, pageId, unlockToken })
  // redirect() works by throwing, so it's called outside any try/catch.
  if (result.reason) redirect(`/code-unavailable?reason=${result.reason}`)
  if (result.locked) redirect(`/r/${encodeURIComponent(shortId)}`)

  const { page } = result
  const back = pagePath(shortId, page.id)
  const title = page.content?.blocks?.[0]?.title || "this page"
  const sent = one(query.sent) === "1"
  const error = ERRORS[one(query.error)] ?? null

  return (
    <div className={styles.page}>
      <div className={`gradient-orb gradient-orb-cyan ${styles.orbCyan}`} />
      <div className={`gradient-orb gradient-orb-purple ${styles.orbPurple}`} />

      <main className={styles.card}>
        {sent ? (
          <div className={styles.done}>
            <div className={styles.icon} aria-hidden="true">
              <CheckCircleIcon size={28} strokeWidth={2.25} />
            </div>
            <h1 className={styles.title}>Thanks for letting us know</h1>
            <p className={styles.body}>
              We’ll look at the page, and take it down if it breaks our rules. We don’t tell the business who reported it.
            </p>
            <Link href={back} className={`btn btn-secondary ${styles.backButton}`}>
              Back to the page
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.icon} aria-hidden="true">
              <FlagIcon size={26} strokeWidth={2.25} />
            </div>
            <h1 className={styles.title}>Report this page</h1>
            <p className={styles.body}>
              You’re reporting <strong className={styles.pageTitle}>{title}</strong> to QR Go, the service the business used to make
              it. We don’t tell them who reported it.
            </p>

            {error && (
              <p className="error-message" role="alert" style={{ marginTop: 20 }}>
                <span aria-hidden="true">⚠</span> {error}
              </p>
            )}

            <form method="post" action={`${pageReportPath(shortId, page.id)}/send`} className={styles.form}>
              <fieldset className={styles.reasons}>
                <legend className={styles.legend}>What’s wrong with it?</legend>
                {REPORT_REASONS.map((reason, index) => (
                  <label key={reason.id} className={styles.reason}>
                    <input type="radio" name="reason" value={reason.id} required={index === 0} />
                    <span>{reason.label}</span>
                  </label>
                ))}
              </fieldset>

              <label htmlFor="report-message" className={styles.legend}>
                Anything else we should know? <span className={styles.optional}>(optional)</span>
              </label>
              <textarea
                id="report-message"
                name="message"
                className={`input-field ${styles.message}`}
                rows={4}
                maxLength={REPORT_MESSAGE_MAX}
                aria-describedby="report-message-hint"
              />
              <p id="report-message-hint" className={styles.hint}>
                Add your email address if you’d like us to reply.
              </p>

              {/* Left empty by people; simple bots fill it in. */}
              <div className={styles.trap} aria-hidden="true">
                <label>
                  Website
                  <input type="text" name={REPORT_HONEYPOT} tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <button type="submit" className={`btn btn-primary ${styles.submit}`}>
                Send report
              </button>
            </form>

            <p className={styles.note}>
              If you’ve lost money or someone is in danger, contact your bank or the police (10111) as well.
            </p>
            <p className={styles.footer}>
              <Link href={back} className={styles.link}>
                ← Back to the page
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  )
}
