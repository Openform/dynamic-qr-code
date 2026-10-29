import { redirect } from "next/navigation"
import { getAdminUser } from "@/lib/admin"
import { loadAllLegalPages } from "@/lib/legalContent"
import LegalEditor from "../components/LegalEditor"

export const metadata = {
  title: "Legal pages — QR Go"
}

/**
 * Edit the Privacy Policy and Terms & Conditions. Checked on the server so
 * non-admins never receive the page — they're sent to their own dashboard.
 */
export default async function AdminLegalPage() {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const pages = await loadAllLegalPages()
  return <LegalEditor initialPages={pages} />
}
