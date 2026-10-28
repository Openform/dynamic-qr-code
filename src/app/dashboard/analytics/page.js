import AnalyticsView from "./components/AnalyticsView"
import { initialFiltersFromPageParams } from "@/lib/analyticsFilters"

export const metadata = {
  title: "Analytics — QR Go"
}

/**
 * Scan analytics for the signed-in user's codes. Signed-out visitors are
 * redirected to /login by the proxy. `?code=<id>` opens one code's analytics
 * (used by the Analytics link on each QR card).
 */
export default async function AnalyticsPage({ searchParams }) {
  const initial = initialFiltersFromPageParams(await searchParams)
  return <AnalyticsView mode="user" initial={initial} />
}
