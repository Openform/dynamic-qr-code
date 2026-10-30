import { connection } from "next/server"
import LegalDocument from "../../components/LegalDocument"
import { getLegalPageInfo } from "@/lib/legal"
import { loadLegalPage } from "@/lib/legalContent"

// The text is edited by admins at /admin/legal.

const info = getLegalPageInfo("terms")

export const metadata = {
  title: `${info.title} — QR Go`,
  description: info.description,
  alternates: { canonical: info.path }
}

export default async function TermsPage() {
  // Read the text on every request so saved changes show straight away.
  await connection()
  const page = await loadLegalPage(info.slug)

  return (
    <LegalDocument
      title={page.title}
      lastUpdated={page.lastUpdated}
      content={page.content}
    />
  )
}
