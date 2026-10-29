import { redirect } from "next/navigation"
import { getAdminUser } from "@/lib/admin"
import { countOpenInviteRequests } from "@/lib/db"
import AdminDashboard from "./components/AdminDashboard"

export const metadata = {
  title: "Admin — QR Go"
}

/**
 * Admin dashboard: every account, its package and usage. Checked on the server
 * so non-admins never receive the page — they're sent to their own dashboard.
 * (Signed-out visitors are already redirected to /login by the proxy.)
 */
export default async function AdminPage() {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const openInviteCount = await countOpenInviteRequests()
  return <AdminDashboard currentAdminId={admin.id} openInviteCount={openInviteCount} />
}
