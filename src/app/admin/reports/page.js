import { redirect } from "next/navigation"
import { getAdminUser } from "@/lib/admin"
import { getPageReports } from "@/lib/db"
import { getReportAlertSettings } from "@/lib/pageReportAlert"
import PageReportsView from "../components/PageReportsView"

export const metadata = {
  title: "Page reports — QR Go"
}

/**
 * Reported campaign pages, for admins to take down, restore or close.
 * Checked on the server so non-admins never receive the page: they're sent
 * to their own dashboard.
 */
export default async function AdminReportsPage() {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const settings = getReportAlertSettings()
  return (
    <PageReportsView
      initialReports={await getPageReports()}
      alertStatus={settings ? { configured: true, to: settings.to } : { configured: false }}
    />
  )
}
