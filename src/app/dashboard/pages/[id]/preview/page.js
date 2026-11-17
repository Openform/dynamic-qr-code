import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import CampaignPage from "@/app/components/campaign/CampaignPage"
import { campaignFontClasses } from "@/app/components/campaign/fonts"
import { getSession } from "@/lib/auth"
import { pageView } from "@/lib/campaignPages"
import { getPageById, getPageImages } from "@/lib/db"
import { imagesFor, ownerFilePath, ownerImagePath } from "@/lib/pageReference"

/**
 * GET /dashboard/pages/[id]/preview — the owner's preview of one of their
 * campaign pages, drawn by the same component as the public page, with a bar
 * above it that only the owner sees. `?view=ended` shows what scanners get
 * once the end date has passed. The page shows here even when it's switched
 * off, taken down or not linked to any code yet, with a note saying so.
 *
 * NOTE: In Next.js 16, `params` and `searchParams` are Promises.
 */

export const metadata = {
  title: "Page preview — QR Go",
  robots: { index: false, follow: false }
}

export default async function CampaignPagePreview({ params, searchParams }) {
  const session = await getSession()
  if (!session) redirect("/login")

  const { id } = await params
  const pageId = Number(id)
  const page = Number.isInteger(pageId) && pageId > 0 ? await getPageById(pageId, session.userId) : null
  if (!page?.content) notFound()

  const showEnded = (await searchParams)?.view === "ended"
  // To preview the ended view, treat the page as ended now, whatever its date.
  const view = showEnded
    ? pageView({ ...page, afterEnd: "ended", endsAt: "1970-01-01 00:00:00" })
    : pageView(page)
  const note = page.takenDownAt
    ? "This page was taken down by QR Go, so scanners can’t see it."
    : !page.published
      ? "This page is switched off, so scanners can’t see it."
      : null

  return (
    <>
      <div style={styles.bar}>
        <span style={styles.label}>
          Preview of <strong>{page.name}</strong>. Only you can see this bar.
        </span>
        <nav style={styles.tabs} aria-label="Preview">
          <Link href={`/dashboard/pages/${pageId}/preview`} style={showEnded ? styles.tab : styles.tabOn} aria-current={showEnded ? undefined : "page"}>
            Live
          </Link>
          <Link href={`/dashboard/pages/${pageId}/preview?view=ended`} style={showEnded ? styles.tabOn : styles.tab} aria-current={showEnded ? "page" : undefined}>
            After it ends
          </Link>
        </nav>
        {note && <span style={styles.note}>{note}</span>}
      </div>
      <CampaignPage
        content={page.content}
        view={view}
        images={imagesFor(await getPageImages(pageId), (image) => ownerImagePath(pageId, image))}
        fileHref={(buttonId, type) => ownerFilePath(pageId, buttonId, type)}
        className={campaignFontClasses}
      />
    </>
  )
}

const styles = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px 16px",
    padding: "10px 16px",
    background: "#0f0f23",
    color: "#e2e8f0",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: "0.88rem"
  },
  label: {
    flex: "1 1 240px"
  },
  tabs: {
    display: "flex",
    gap: "4px"
  },
  tab: {
    padding: "8px 14px",
    borderRadius: "8px",
    color: "#cbd5e1"
  },
  tabOn: {
    padding: "8px 14px",
    borderRadius: "8px",
    background: "#00d4ff",
    color: "#0a0a1a",
    fontWeight: 600
  },
  note: {
    flex: "1 1 100%",
    color: "#fcd34d"
  }
}
