import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import CampaignPage from "@/app/components/campaign/CampaignPage"
import { campaignFontClasses } from "@/app/components/campaign/fonts"
import { pageView } from "@/lib/campaignPages"
import { pageLook } from "@/lib/pageTheme"
import { loadPublicPage } from "@/lib/publicPage"
import { UNLOCK_COOKIE } from "@/lib/unlock"

/**
 * GET /r/[shortId]/p/[pageId] — a campaign page, shown under the code that
 * links to it. lib/publicPage.js checks the code (its owner, its password,
 * that it links here) and the page on every visit.
 *
 * Opening the page doesn't count a scan: the scan was counted at
 * /r/[shortId] before it sent the visitor here. Search engines are kept away
 * (robots.txt already turns them away from /r/), but link previews still get
 * the page's title and tagline.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

// Loaded once per request, for the metadata, the viewport and the page.
const load = cache(async (shortId, pageId) => {
  const unlockToken = (await cookies()).get(UNLOCK_COOKIE)?.value
  return loadPublicPage({ shortId, pageId, unlockToken })
})

export async function generateMetadata({ params }) {
  const { shortId, pageId } = await params
  const { page } = await load(shortId, pageId)
  const robots = { index: false, follow: false }
  const header = page?.content?.blocks?.[0]
  if (!header?.title) return { title: "QR Go", robots }
  const description = header.tagline || undefined
  return {
    title: header.title,
    description,
    robots,
    // No siteName: the page is the business's, not QR Go's.
    openGraph: { type: "website", title: header.title, description }
  }
}

export async function generateViewport({ params }) {
  const { shortId, pageId } = await params
  const { page } = await load(shortId, pageId)
  // The phone's browser bar takes the page's background colour.
  return page ? { themeColor: pageLook(page.content).colors.bg } : {}
}

export default async function PublicCampaignPage({ params }) {
  const { shortId, pageId } = await params
  const result = await load(shortId, pageId)
  // redirect() works by throwing, so it's called outside any try/catch.
  if (result.reason) redirect(`/code-unavailable?reason=${result.reason}`)
  // The code's link asks for the password, then sends the visitor on.
  if (result.locked) redirect(`/r/${encodeURIComponent(shortId)}`)

  return (
    <CampaignPage
      content={result.page.content}
      view={pageView(result.page)}
      className={campaignFontClasses}
    />
  )
}
