import { notFound } from "next/navigation"
import { LockIcon } from "@/app/components/icons"
import {
  STAGING_ACCESS_API,
  STAGING_ACCESS_DAYS,
  safeNextPath,
  stagingPassword
} from "@/lib/stagingAccess"
import StagingAccessForm from "./StagingAccessForm"
import styles from "./staging.module.css"

/**
 * The staging site's sign-in page. src/proxy.js sends every visitor here
 * until their browser has the staging password (lib/stagingAccess.js):
 *   ?next=<path>          — where they were going, e.g. a scanned code's link
 *   ?error=wrong|limited  — set when the form was posted without the page's
 *                           script and the server sent it back
 *
 * Only exists on the staging site (STAGING_PASSWORD set); 404 elsewhere.
 *
 * NOTE: In Next.js 16, `searchParams` is a Promise.
 */

export const metadata = {
  title: "Staging — QR Go",
  robots: { index: false, follow: false }
}

// Worked out on each request: whether this is the staging site is read from
// STAGING_PASSWORD when the app runs, not when it's built.
export const dynamic = "force-dynamic"

const one = (value) => (Array.isArray(value) ? value[0] : value)

export default async function StagingAccessPage({ searchParams }) {
  const query = await searchParams
  if (!stagingPassword()) notFound()

  return (
    <div className={styles.page}>
      <main className={`animate-slideUp ${styles.card}`}>
        <div className={styles.icon} aria-hidden="true">
          <LockIcon size={28} strokeWidth={2.25} />
        </div>
        <p className={styles.badge}>Staging</p>
        <h1 className={styles.title}>This is QR Go&apos;s test site</h1>
        <p className={styles.body}>
          Enter the staging password to continue. This browser will stay signed
          in for {STAGING_ACCESS_DAYS} days.
        </p>

        <StagingAccessForm
          action={STAGING_ACCESS_API}
          next={safeNextPath(one(query.next))}
          initialError={one(query.error)}
        />
      </main>
    </div>
  )
}
