import { SITE_URL } from "@/lib/site"
import { stagingPassword } from "@/lib/stagingAccess"

// Worked out on each request, so the staging site (STAGING_PASSWORD set)
// can turn every crawler away without a separate build.
export const dynamic = "force-dynamic"

export default function robots() {
  if (stagingPassword()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  // Keep crawlers on the public pages. /r/ links are customers' QR redirects,
  // so crawling them would only add bot visits to their scan counts.
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api/", "/r/", "/code-unavailable"]
    },
    sitemap: `${SITE_URL}/sitemap.xml`
  }
}
