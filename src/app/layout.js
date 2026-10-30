import localFont from "next/font/local"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site"
import "./globals.css"

// Self-hosted Inter (variable, weights 100–900). See ./fonts/README.md.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter"
})

// Icons come from favicon.ico, icon.png and apple-icon.png in this folder.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  appleWebApp: { title: SITE_NAME },
  // Pages that set their own openGraph replace this whole object, so the
  // homepage repeats siteName.
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_ZA" }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
