import { SITE_URL } from "@/lib/site"

// Keep crawlers on the public pages. /r/ links are customers' QR redirects, so
// crawling them would only add bot visits to their scan counts.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api/", "/r/", "/code-unavailable"]
    },
    sitemap: `${SITE_URL}/sitemap.xml`
  }
}
