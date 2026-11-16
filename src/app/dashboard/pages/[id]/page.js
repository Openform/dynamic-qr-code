import PageEditor from "./PageEditor"

/**
 * /dashboard/pages/[id] — the campaign page editor (PageEditor). The proxy
 * (src/proxy.js) only lets signed-in visitors into /dashboard, and the API
 * only gives the editor the account's own pages.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

export const metadata = {
  title: "Edit page — QR Go",
  robots: { index: false, follow: false }
}

export default async function EditCampaignPage({ params }) {
  const { id } = await params
  const pageId = Number(id)
  return <PageEditor pageId={Number.isInteger(pageId) && pageId > 0 ? pageId : 0} />
}
