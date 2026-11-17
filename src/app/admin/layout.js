import { redirect } from "next/navigation"
import AppShell from "@/app/components/shell/AppShell"
import { loadSidebarAccount, loadSidebarCollapsed } from "@/lib/sidebarAccount"

/**
 * The frame (sidebar) around every /admin screen, with the admin sections
 * listed. Each screen also checks on the server that it's an admin asking;
 * this sends anyone else to their own dashboard before any of it is drawn.
 */
export default async function AdminLayout({ children }) {
  const [{ signedOut, user, adminCounts }, collapsed] = await Promise.all([
    loadSidebarAccount(),
    loadSidebarCollapsed()
  ])
  if (signedOut) redirect("/login")
  if (user && !user.isAdmin) redirect("/dashboard")
  return (
    <AppShell user={user} adminCounts={adminCounts} collapsed={collapsed}>
      {children}
    </AppShell>
  )
}
