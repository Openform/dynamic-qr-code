import { notFound, redirect } from "next/navigation"
import CampaignPage from "@/app/components/campaign/CampaignPage"
import { campaignFontClasses } from "@/app/components/campaign/fonts"
import { getAdminUser } from "@/lib/admin"
import { isPageEnded, pageView } from "@/lib/campaignPages"
import { getPageForAdmin, getPageImages, getPageReports } from "@/lib/db"
import { adminImagePath, imagesFor } from "@/lib/pageReference"
import { linksOnPage } from "@/lib/pageReports"
import AdminPageBar from "./AdminPageBar"

/**
 * GET /admin/pages/[id] — any account's campaign page as its visitors see
 * it, for an admin judging a report. A bar above it says whose it is and
 * whether it's live, lists where its buttons and links go, and has Take down,
 * Restore and Close reports. The page shows even if it's switched off, taken
 * down or past its end date (its blocks, not "This campaign has ended").
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

export const metadata = {
  title: "Reported page — QR Go",
  robots: { index: false, follow: false }
}

export default async function AdminPageView({ params }) {
  const admin = await getAdminUser()
  if (!admin) redirect("/dashboard")

  const { id } = await params
  const pageId = Number(id)
  const page = Number.isInteger(pageId) && pageId > 0 ? await getPageForAdmin(pageId) : null
  if (!page?.content) notFound()

  // Its blocks as visitors saw them before any end date.
  const view = pageView({ ...page, endsAt: null })
  const reports = await getPageReports({ pageId })
  const status = page.takenDownAt
    ? "Taken down by QR Go"
    : !page.published
      ? "Switched off by its owner"
      : isPageEnded(page)
        ? "Live, but past its end date, so visitors see “This campaign has ended”"
        : "Live"

  return (
    <>
      <AdminPageBar
        page={{
          id: page.id,
          name: page.name,
          title: view.header?.title || "",
          ownerName: page.ownerName,
          ownerEmail: page.ownerEmail,
          ownerDisabled: page.ownerDisabled,
          takenDown: Boolean(page.takenDownAt),
          status
        }}
        openReports={reports.filter((report) => !report.handledAt).length}
        links={linksOnPage(view.blocks)}
      />
      <CampaignPage
        content={page.content}
        view={view}
        images={imagesFor(await getPageImages(pageId), (image) => adminImagePath(pageId, image))}
        // Calendar and contact buttons are drawn, but don't download here.
        fileHref={() => "#"}
        className={campaignFontClasses}
      />
    </>
  )
}
