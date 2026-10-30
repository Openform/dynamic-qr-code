import { LEGAL_PAGES } from "@/lib/legal"
import { SITE_URL } from "@/lib/site"

export default function sitemap() {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    ...LEGAL_PAGES.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      changeFrequency: "yearly",
      priority: 0.3
    }))
  ]
}
