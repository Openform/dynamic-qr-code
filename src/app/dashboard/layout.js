import { redirect } from "next/navigation"
import AppShell from "@/app/components/shell/AppShell"
import { loadSidebarAccount } from "@/lib/sidebarAccount"

/**
 * The frame (sidebar) around every /dashboard screen. Signed-out visitors
 * are sent to /login by the proxy already; this catches a session whose
 * account has gone.
 */
export default async function DashboardLayout({ children }) {
  const { signedOut, user, adminCounts } = await loadSidebarAccount()
  if (signedOut) redirect("/login")
  return (
    <AppShell user={user} adminCounts={adminCounts}>
      {children}
    </AppShell>
  )
}
