import { redirect } from "next/navigation"
import { getAdminUser } from "@/lib/admin"
import { initialFiltersFromPageParams } from "@/lib/analyticsFilters"
import AnalyticsView from "@/app/dashboard/analytics/components/AnalyticsView"

export const metadata = {
  title: "Platform analytics — QR Go"
}

/**
 * Scan analytics across every account, for admins. Checked on the server so
 * non-admins never receive the page — they're sent to their own dashboard.
 */
export default async function AdminAnalyticsPage({ searchParams }) {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const initial = initialFiltersFromPageParams(await searchParams)
  return <AnalyticsView mode="admin" initial={initial} />
}
