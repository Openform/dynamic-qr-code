import Link from "next/link"
import { redirect } from "next/navigation"
import { LockIcon } from "@/app/components/icons"
import { getQRCodeByShortId } from "@/lib/db"
import UnlockForm from "./UnlockForm"
import styles from "./unlock.module.css"

/**
 * The password page for a code with a password. /r/[shortId] sends people
 * here when their browser hasn't entered the password yet:
 *   ?p=<id>      — the showing of this page, so a right answer can be
 *                  counted against it (see qrcode_password_prompts)
 *   ?error=wrong | limited — set when the form was posted without the page's
 *                  script and the server sent it back
 *
 * The visitor is usually a member of the public, so like /code-unavailable
 * this never says whose code it is or what it's called. A code that no longer
 * has a password goes straight on to its link.
 *
 * NOTE: In Next.js 16, `params` and `searchParams` are Promises.
 */

export const metadata = {
  title: "Password required — QR Go",
  robots: { index: false, follow: false }
}

/** "locked", "open" (no password), or a /code-unavailable reason. */
async function codeStatus(shortId) {
  try {
    const qrcode = await getQRCodeByShortId(shortId)
    if (!qrcode) return "not-found"
    if (qrcode.owner_disabled_at) return "inactive"
    return qrcode.access_password ? "locked" : "open"
  } catch (error) {
    console.error("Password page lookup error:", error)
    return "error"
  }
}

const one = (value) => (Array.isArray(value) ? value[0] : value)

export default async function UnlockPage({ params, searchParams }) {
  const { shortId } = await params
  const query = await searchParams
  const link = `/r/${encodeURIComponent(shortId)}`

  // redirect() works by throwing, so it's kept outside the try above.
  const status = await codeStatus(shortId)
  if (status === "open") redirect(link)
  if (status !== "locked") redirect(`/code-unavailable?reason=${status}`)

  const prompt = one(query.p)
  const promptId = typeof prompt === "string" && /^\d{1,19}$/.test(prompt) ? prompt : null

  return (
    <div className={styles.page}>
      <div className={`gradient-orb gradient-orb-cyan ${styles.orbCyan}`} />
      <div className={`gradient-orb gradient-orb-purple ${styles.orbPurple}`} />

      <main className={`animate-slideUp ${styles.card}`}>
        <div className={styles.icon} aria-hidden="true">
          <LockIcon size={28} strokeWidth={2.25} />
        </div>
        <h1 className={styles.title}>This QR code needs a password</h1>
        <p className={styles.body}>
          Enter the password you were given to continue.
        </p>

        <UnlockForm action={link} promptId={promptId} initialError={one(query.error)} />

        <p className={styles.footer}>
          Powered by{" "}
          <Link href="/" className={styles.link}>
            QR Go
          </Link>
        </p>
      </main>
    </div>
  )
}
