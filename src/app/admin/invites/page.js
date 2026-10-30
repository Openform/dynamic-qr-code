import { redirect } from "next/navigation"
import { getAdminUser } from "@/lib/admin"
import { toClientInviteRequest } from "@/lib/inviteRequests"
import { getInviteRequests } from "@/lib/db"
import { getAlertStatus } from "@/lib/inviteAlert"
import InviteRequestsView from "../components/InviteRequestsView"

export const metadata = {
  title: "Invite requests — QR Go"
}

/**
 * Requests from the "Request access" form on the public pages. Checked on
 * the server so non-admins never receive the page — they're sent to their own
 * dashboard.
 */
export default async function AdminInvitesPage() {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const rows = await getInviteRequests()
  return (
    <InviteRequestsView
      initialRequests={rows.map(toClientInviteRequest)}
      alertStatus={getAlertStatus()}
    />
  )
}
